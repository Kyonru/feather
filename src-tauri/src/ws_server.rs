use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter};
use tokio::{sync::mpsc, time::{timeout, Duration}};
use uuid::Uuid;

// Sender half for pushing commands from desktop → game
type WsSender = mpsc::UnboundedSender<Message>;

/// The app ID the desktop expects games to present. Empty string means "accept any".
pub type AppId = Arc<Mutex<String>>;

#[derive(Clone)]
pub struct SessionData {
    pub sender: WsSender,
}

pub type Sessions = Arc<Mutex<HashMap<String, SessionData>>>;

#[derive(Clone)]
struct AppState {
    sessions: Sessions,
    app_id: AppId,
    events: Arc<dyn WsEventSink>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct BinaryPayload {
    _session: String,
    bytes: Vec<u8>,
}

trait WsEventSink: Send + Sync {
    fn session_start(&self, session_id: String);
    fn message(&self, payload: String);
    fn binary(&self, payload: BinaryPayload);
    fn session_end(&self, session_id: String);
}

struct TauriEventSink {
    app_handle: AppHandle,
}

impl WsEventSink for TauriEventSink {
    fn session_start(&self, session_id: String) {
        let _ = self.app_handle.emit("feather://session-start", session_id);
    }

    fn message(&self, payload: String) {
        let _ = self.app_handle.emit("feather://message", payload);
    }

    fn binary(&self, payload: BinaryPayload) {
        let _ = self.app_handle.emit("feather://binary", payload);
    }

    fn session_end(&self, session_id: String) {
        let _ = self.app_handle.emit("feather://session-end", session_id);
    }
}

/// Start the WebSocket server. Called once during Tauri setup.
pub fn start(app_handle: AppHandle, port: u16, sessions: Sessions, app_id: AppId) {
    let state = AppState {
        sessions,
        app_id,
        events: Arc::new(TauriEventSink { app_handle }),
    };

    tauri::async_runtime::spawn(async move {
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .expect("failed to bind WS server");

        serve_ws(listener, state).await;
    });
}

/// Tauri command: update the app ID used to authenticate incoming game connections.
#[tauri::command]
pub fn set_app_id(app_id_str: String, app_id: tauri::State<AppId>) {
    *app_id.lock().unwrap_or_else(|e| e.into_inner()) = app_id_str;
}

/// Tauri command: return all currently connected session IDs.
#[tauri::command]
pub fn get_active_sessions(state: tauri::State<Sessions>) -> Vec<String> {
    state
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .keys()
        .cloned()
        .collect()
}

/// Tauri command: send a JSON command string to a specific game session.
#[tauri::command]
pub fn send_command(
    session_id: String,
    message: String,
    state: tauri::State<Sessions>,
) -> Result<(), String> {
    let sessions = state.lock().map_err(|e| e.to_string())?;
    if let Some(data) = sessions.get(&session_id) {
        data.sender
            .send(Message::Text(message.into()))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Tauri command: forcibly close (drop) a session.
#[tauri::command]
pub fn close_session(
    session_id: String,
    state: tauri::State<Sessions>,
) -> Result<(), String> {
    state.lock().map_err(|e| e.to_string())?.remove(&session_id);
    Ok(())
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.max_message_size(64 * 1024 * 1024) // 64 MB — GIF frames can be large
        .on_upgrade(move |socket| handle_socket(socket, state))
}

async fn serve_ws(listener: tokio::net::TcpListener, state: AppState) {
    let app = Router::new().route("/", get(ws_handler)).with_state(state);
    axum::serve(listener, app).await.expect("WS server error");
}

// Minimal parsed fields from an auth:response message.
#[derive(serde::Deserialize)]
struct AuthResponseMsg {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(rename = "appId", default)]
    app_id: String,
    #[serde(default)]
    nonce: String,
    #[serde(default)]
    insecure: bool,
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let session_id = Uuid::new_v4().to_string();
    let (mut ws_tx, mut ws_rx) = socket.split();

    // ── Phase 1: auth handshake (fully Rust-side, no JS involvement) ──────────
    //
    // Send auth:challenge directly over the WS connection. The game responds
    // with auth:response; we validate nonce + appId and send auth:ok or auth:fail.
    // Only after a successful handshake do we emit session-start to JS.

    let nonce = Uuid::new_v4().to_string();
    let challenge = format!(r#"{{"type":"auth:challenge","nonce":"{}"}}"#, nonce);
    if ws_tx
        .send(Message::Text(challenge.into()))
        .await
        .is_err()
    {
        return; // connection died before we could send the challenge
    }

    // Wait up to 30 s for the game to respond with auth:response.
    let auth_ok = timeout(Duration::from_secs(30), async {
        loop {
            match ws_rx.next().await {
                Some(Ok(Message::Text(text))) => {
                    let Ok(msg) = serde_json::from_str::<AuthResponseMsg>(&text) else {
                        continue;
                    };
                    if msg.msg_type != "auth:response" {
                        continue; // ignore anything else during handshake
                    }

                    let current_app_id = state.app_id.lock().unwrap_or_else(|e| e.into_inner()).clone();
                    let nonce_ok = msg.nonce == nonce;
                    // Accept if: game is in insecure mode, OR desktop has no appId configured,
                    // OR the appIds match.
                    let app_id_ok =
                        msg.insecure || current_app_id.is_empty() || msg.app_id == current_app_id;

                    if nonce_ok && app_id_ok {
                        let _ = ws_tx
                            .send(Message::Text(r#"{"type":"auth:ok"}"#.into()))
                            .await;
                        return true;
                    } else {
                        let _ = ws_tx
                            .send(Message::Text(
                                r#"{"type":"auth:fail","reason":"appId mismatch"}"#.into(),
                            ))
                            .await;
                        return false;
                    }
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return false,
                _ => {} // ignore binary / ping / pong during handshake
            }
        }
    })
    .await
    .unwrap_or(false); // timeout → reject

    if !auth_ok {
        return; // don't register the session or notify JS
    }

    // ── Phase 2: normal session lifecycle ────────────────────────────────────

    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    state
        .sessions
        .lock()
        .unwrap()
        .insert(session_id.clone(), SessionData { sender: tx });

    // Notify frontend — the game will send feather:hello on its own now that
    // auth:ok was delivered. The frontend can also send req:config as a nudge.
    state.events.session_start(session_id.clone());

    // Forward desktop→game commands to the WS socket
    let forward_session_id = session_id.clone();
    let forward_sessions = state.sessions.clone();
    let forward_task = tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
        forward_sessions.lock().unwrap().remove(&forward_session_id);
    });

    // Read game→desktop messages and forward to frontend with _session injected
    while let Some(result) = ws_rx.next().await {
        match result {
            Ok(msg) => match msg {
                Message::Text(text) => {
                    if text.starts_with('{') {
                        let injected =
                            format!(r#"{{"_session":"{}",{}"#, session_id, &text[1..]);
                        state.events.message(injected);
                    }
                }
                Message::Binary(bytes) => {
                    state.events.binary(BinaryPayload {
                        _session: session_id.clone(),
                        bytes: bytes.to_vec(),
                    });
                }
                Message::Close(_) => break,
                _ => {}
            },
            Err(_) => break,
        }
    }

    // Clean up session
    state.sessions.lock().unwrap().remove(&session_id);
    forward_task.abort();

    state.events.session_end(session_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use std::time::Duration;
    use tokio::time::timeout;
    use tokio_tungstenite::{connect_async, tungstenite::Message as ClientMessage};

    #[derive(Debug, PartialEq)]
    enum TestEvent {
        SessionStart(String),
        Message(String),
        Binary(BinaryPayload),
        SessionEnd(String),
    }

    struct CapturedEvents {
        tx: mpsc::UnboundedSender<TestEvent>,
    }

    impl WsEventSink for CapturedEvents {
        fn session_start(&self, session_id: String) {
            self.tx
                .send(TestEvent::SessionStart(session_id))
                .expect("test event receiver should be open");
        }

        fn message(&self, payload: String) {
            self.tx
                .send(TestEvent::Message(payload))
                .expect("test event receiver should be open");
        }

        fn binary(&self, payload: BinaryPayload) {
            self.tx
                .send(TestEvent::Binary(payload))
                .expect("test event receiver should be open");
        }

        fn session_end(&self, session_id: String) {
            self.tx
                .send(TestEvent::SessionEnd(session_id))
                .expect("test event receiver should be open");
        }
    }

    async fn spawn_test_server() -> (
        SocketAddr,
        Sessions,
        mpsc::UnboundedReceiver<TestEvent>,
        tokio::task::JoinHandle<()>,
    ) {
        let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
        let (tx, rx) = mpsc::unbounded_channel();
        let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .expect("test server should bind to an ephemeral port");
        let addr = listener
            .local_addr()
            .expect("test listener should have an addr");
        let state = AppState {
            sessions: sessions.clone(),
            app_id: Arc::new(Mutex::new(String::new())), // empty = accept any
            events: Arc::new(CapturedEvents { tx }),
        };
        let task = tokio::spawn(async move { serve_ws(listener, state).await });

        (addr, sessions, rx, task)
    }

    async fn next_event(rx: &mut mpsc::UnboundedReceiver<TestEvent>) -> TestEvent {
        timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("timed out waiting for WS event")
            .expect("test event channel closed")
    }

    /// Complete the auth handshake that the server now requires before any session data flows.
    /// With an empty server app_id, the nonce just needs to match; appId can be anything.
    async fn do_handshake(socket: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>) -> String {
        // Receive auth:challenge
        let challenge_msg = timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("timed out waiting for auth:challenge")
            .expect("socket closed before challenge")
            .expect("challenge should be a valid message");

        let challenge_text = match challenge_msg {
            ClientMessage::Text(t) => t,
            other => panic!("expected text challenge, got {other:?}"),
        };

        let challenge: serde_json::Value = serde_json::from_str(&challenge_text)
            .expect("challenge should be valid JSON");
        assert_eq!(challenge["type"], "auth:challenge");
        let nonce = challenge["nonce"].as_str().expect("nonce should be a string").to_owned();

        // Send auth:response
        let response = serde_json::json!({
            "type": "auth:response",
            "appId": "",
            "nonce": nonce,
        });
        socket
            .send(ClientMessage::Text(response.to_string().into()))
            .await
            .expect("client should send auth:response");

        // Receive auth:ok
        let ok_msg = timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("timed out waiting for auth:ok")
            .expect("socket closed before auth:ok")
            .expect("auth:ok should be a valid message");

        let ok_text = match ok_msg {
            ClientMessage::Text(t) => t,
            other => panic!("expected text auth:ok, got {other:?}"),
        };
        let ok: serde_json::Value = serde_json::from_str(&ok_text).expect("auth:ok should be JSON");
        assert_eq!(ok["type"], "auth:ok");

        nonce
    }

    #[tokio::test]
    async fn emits_lifecycle_text_and_binary_events() {
        let (addr, sessions, mut events, server) = spawn_test_server().await;
        let (mut socket, _) = connect_async(format!("ws://{addr}/"))
            .await
            .expect("client should connect to test WS server");

        do_handshake(&mut socket).await;

        let session_id = match next_event(&mut events).await {
            TestEvent::SessionStart(session_id) => session_id,
            event => panic!("expected session start, got {event:?}"),
        };

        socket
            .send(ClientMessage::Text(
                r#"{"type":"feather:hello","config":{"name":"E2E"}}"#.into(),
            ))
            .await
            .expect("client should send JSON text");
        assert_eq!(
            next_event(&mut events).await,
            TestEvent::Message(format!(
                r#"{{"_session":"{}","type":"feather:hello","config":{{"name":"E2E"}}}}"#,
                session_id
            ))
        );

        socket
            .send(ClientMessage::Binary(vec![1, 2, 3, 5, 8].into()))
            .await
            .expect("client should send binary bytes");
        assert_eq!(
            next_event(&mut events).await,
            TestEvent::Binary(BinaryPayload {
                _session: session_id.clone(),
                bytes: vec![1, 2, 3, 5, 8],
            })
        );

        socket
            .close(None)
            .await
            .expect("client should close cleanly");
        assert_eq!(
            next_event(&mut events).await,
            TestEvent::SessionEnd(session_id)
        );
        assert!(sessions.lock().unwrap().is_empty());

        server.abort();
    }

    #[tokio::test]
    async fn forwards_desktop_commands_to_connected_session() {
        let (addr, sessions, mut events, server) = spawn_test_server().await;
        let (mut socket, _) = connect_async(format!("ws://{addr}/"))
            .await
            .expect("client should connect to test WS server");

        do_handshake(&mut socket).await;

        let session_id = match next_event(&mut events).await {
            TestEvent::SessionStart(session_id) => session_id,
            event => panic!("expected session start, got {event:?}"),
        };

        let sender = sessions
            .lock()
            .unwrap()
            .get(&session_id)
            .map(|d| d.sender.clone())
            .expect("connected session should have a command sender");
        sender
            .send(Message::Text(r#"{"type":"req:performance"}"#.into()))
            .expect("server should enqueue desktop command");

        let received = timeout(Duration::from_secs(2), socket.next())
            .await
            .expect("timed out waiting for forwarded command")
            .expect("client socket should still be open")
            .expect("forwarded command should be valid");
        assert_eq!(
            received,
            ClientMessage::Text(r#"{"type":"req:performance"}"#.into())
        );

        socket
            .close(None)
            .await
            .expect("client should close cleanly");
        server.abort();
    }

    #[tokio::test]
    async fn rejects_wrong_nonce() {
        let (addr, _sessions, mut events, server) = spawn_test_server().await;
        let (mut socket, _) = connect_async(format!("ws://{addr}/"))
            .await
            .expect("client should connect");

        // Receive challenge but reply with wrong nonce
        let challenge_msg = timeout(Duration::from_secs(5), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let _challenge_text = match challenge_msg {
            ClientMessage::Text(t) => t,
            other => panic!("expected challenge text, got {other:?}"),
        };

        let bad_response = r#"{"type":"auth:response","appId":"","nonce":"wrong-nonce"}"#;
        socket
            .send(ClientMessage::Text(bad_response.into()))
            .await
            .expect("client should send bad auth:response");

        // Server should send auth:fail and close — no session-start should fire
        let fail_msg = timeout(Duration::from_secs(5), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let fail_text = match fail_msg {
            ClientMessage::Text(t) => t,
            other => panic!("expected auth:fail text, got {other:?}"),
        };
        let fail: serde_json::Value = serde_json::from_str(&fail_text).unwrap();
        assert_eq!(fail["type"], "auth:fail");

        // No session-start event should be emitted
        let result = timeout(Duration::from_millis(500), events.recv()).await;
        assert!(result.is_err(), "should not emit session-start after auth failure");

        server.abort();
    }
}
