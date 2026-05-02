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
    app_handle: AppHandle,
}

/// Start the WebSocket server. Called once during Tauri setup.
/// The `sessions` Arc is shared with the managed Tauri state so `send_command` can reach it.
pub fn start(app_handle: AppHandle, port: u16, sessions: Sessions) {
    let state = AppState {
        sessions,
        app_handle,
    };

    tauri::async_runtime::spawn(async move {
        let app = Router::new().route("/", get(ws_handler)).with_state(state);

        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .expect("failed to bind WS server");

        axum::serve(listener, app).await.expect("WS server error");
    });
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
    ws.on_upgrade(move |socket| handle_socket(socket, state))
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
    let _ = state
        .app_handle
        .emit("feather://session-start", session_id.clone());

    // Forward desktop→game commands to the WS socket
    let forward_task = tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Read game→desktop messages, emit as Tauri events wrapped with the Rust session ID
    // so the frontend can route multi-session messages without trusting the game's own UUID.
    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Text(text) => {
                // Inject _session into the JSON so the frontend can key caches on it
                if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&text) {
                    value["_session"] = serde_json::Value::String(session_id.clone());
                    let _ = state
                        .app_handle
                        .emit("feather://message", value.to_string());
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Clean up session
    state.sessions.lock().unwrap().remove(&session_id);
    forward_task.abort();

    let _ = state.app_handle.emit("feather://session-end", session_id);
}
