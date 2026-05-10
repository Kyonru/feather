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
use tokio::sync::mpsc;
use uuid::Uuid;

// Sender half for pushing commands from desktop → game
type WsSender = mpsc::UnboundedSender<Message>;
pub type Sessions = Arc<Mutex<HashMap<String, WsSender>>>;

#[derive(Clone)]
struct AppState {
    sessions: Sessions,
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
/// The `sessions` Arc is shared with the managed Tauri state so `send_command` can reach it.
pub fn start(app_handle: AppHandle, port: u16, sessions: Sessions) {
    let state = AppState {
        sessions,
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
    if let Some(sender) = sessions.get(&session_id) {
        sender
            .send(Message::Text(message.into()))
            .map_err(|e| e.to_string())?;
    }
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

async fn handle_socket(socket: WebSocket, state: AppState) {
    let session_id = Uuid::new_v4().to_string();
    let (mut ws_tx, mut ws_rx) = socket.split();

    // Channel for desktop → game messages
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register session
    state
        .sessions
        .lock()
        .unwrap()
        .insert(session_id.clone(), tx);

    // Notify frontend a session opened (frontend will wait for feather:hello to get config)
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

    // Read game→desktop messages, forward to frontend with session ID injected via string splice
    while let Some(result) = ws_rx.next().await {
        match result {
            Ok(msg) => match msg {
                Message::Text(text) => {
                    // Inject _session without JSON parsing: splice into the leading '{'
                    if text.starts_with('{') {
                        let injected = format!(r#"{{"_session":"{}",{}"#, session_id, &text[1..]);
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
            events: Arc::new(CapturedEvents { tx }),
        };
        let task = tokio::spawn(async move { serve_ws(listener, state).await });

        (addr, sessions, rx, task)
    }

    async fn next_event(rx: &mut mpsc::UnboundedReceiver<TestEvent>) -> TestEvent {
        timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("timed out waiting for WS event")
            .expect("test event channel closed")
    }

    #[tokio::test]
    async fn emits_lifecycle_text_and_binary_events() {
        let (addr, sessions, mut events, server) = spawn_test_server().await;
        let (mut socket, _) = connect_async(format!("ws://{addr}/"))
            .await
            .expect("client should connect to test WS server");

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

        let session_id = match next_event(&mut events).await {
            TestEvent::SessionStart(session_id) => session_id,
            event => panic!("expected session start, got {event:?}"),
        };

        let sender = sessions
            .lock()
            .unwrap()
            .get(&session_id)
            .cloned()
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
}
