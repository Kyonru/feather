//! Feather Studio's creative MCP endpoint.
//!
//! There is one Feather MCP server, exposed by the CLI as `feather mcp`. Agents
//! configure one thing. But the state behind it now lives in two processes:
//! Inspector owns sessions and debugging, Studio owns shaders, textures and
//! particles. So the single server routes — session traffic to Inspector, and
//! `/creative/*` here.
//!
//! This does **not** make Studio a second way to reach a running game. It serves
//! Studio's own authoring state and nothing else; pushing work into a game still
//! goes through the authenticated Inspector bridge in `session-bridge`. That
//! distinction is why Studio may have an HTTP listener at all while still having
//! no WebSocket server and no CLI sidecar.
//!
//! Creative state lives in the webview, so this relays: a request arrives, is
//! emitted to the frontend, and the frontend answers through a Tauri command
//! that resolves the waiting channel.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

/// How long a creative action may take before the caller gets a timeout rather
/// than hanging. Generation can be slow, so this is generous.
const ACTION_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Serialize)]
pub struct CreativeActionResponse {
    pub ok: bool,
    pub response: Option<Value>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
struct CreativeRequestEvent {
    id: String,
    tool: String,
    action: String,
    params: Value,
}

#[derive(Deserialize)]
struct CreativeActionBody {
    action: String,
    #[serde(default)]
    params: Value,
}

struct Inner {
    app_handle: Mutex<Option<AppHandle>>,
    token: Mutex<String>,
    snapshots: Mutex<HashMap<String, Value>>,
    waiters: Mutex<HashMap<String, oneshot::Sender<CreativeActionResponse>>>,
}

#[derive(Clone)]
pub struct CreativeMcpState {
    inner: Arc<Inner>,
}

impl CreativeMcpState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                app_handle: Mutex::new(None),
                token: Mutex::new(format!("studio-mcp-{}", uuid::Uuid::new_v4())),
                snapshots: Mutex::new(HashMap::new()),
                waiters: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.inner.app_handle.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle);
    }

    pub fn token(&self) -> String {
        self.inner.token.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn set_snapshot(&self, tool: &str, snapshot: Value) {
        self.inner
            .snapshots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(tool.to_string(), snapshot);
    }

    fn snapshot(&self, tool: &str) -> Option<Value> {
        self.inner
            .snapshots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(tool)
            .cloned()
    }

    fn resolve(&self, id: &str, response: CreativeActionResponse) {
        if let Some(sender) = self
            .inner
            .waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(id)
        {
            let _ = sender.send(response);
        }
    }
}

impl Default for CreativeMcpState {
    fn default() -> Self {
        Self::new()
    }
}

/// Bearer token, compared in full. The endpoint is loopback-only, but a token
/// still matters: anything running as the user on this machine could otherwise
/// read and mutate their work.
fn authorize(headers: &HeaderMap, state: &CreativeMcpState) -> Result<(), Response> {
    let expected = state.token();
    let presented = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default();

    if presented == expected && !expected.is_empty() {
        return Ok(());
    }
    Err((
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "invalid or missing Studio MCP token" })),
    )
        .into_response())
}

async fn health(State(state): State<CreativeMcpState>) -> Response {
    let tools: Vec<String> = state
        .inner
        .snapshots
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .keys()
        .cloned()
        .collect();
    Json(json!({ "app": "studio", "ok": true, "tools": tools })).into_response()
}

async fn get_snapshot(
    headers: HeaderMap,
    State(state): State<CreativeMcpState>,
    Path(tool): Path<String>,
) -> Response {
    if let Err(response) = authorize(&headers, &state) {
        return response;
    }
    match state.snapshot(&tool) {
        Some(snapshot) => Json(snapshot).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("Feather Studio has no snapshot for \"{tool}\" yet") })),
        )
            .into_response(),
    }
}

async fn send_action(
    headers: HeaderMap,
    State(state): State<CreativeMcpState>,
    Path(tool): Path<String>,
    Json(body): Json<CreativeActionBody>,
) -> Response {
    if let Err(response) = authorize(&headers, &state) {
        return response;
    }

    let handle = state
        .inner
        .app_handle
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let Some(handle) = handle else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "Feather Studio is still starting" })),
        )
            .into_response();
    };

    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    state
        .inner
        .waiters
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id.clone(), tx);

    let event = CreativeRequestEvent {
        id: id.clone(),
        tool,
        action: body.action,
        params: body.params,
    };
    if handle.emit("feather://mcp-creative-request", event).is_err() {
        state
            .inner
            .waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "could not reach the Studio window" })),
        )
            .into_response();
    }

    match tokio::time::timeout(ACTION_TIMEOUT, rx).await {
        Ok(Ok(result)) if result.ok => Json(json!({ "ok": true, "response": result.response })).into_response(),
        Ok(Ok(result)) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": result.error.unwrap_or_else(|| "the action failed".into()) })),
        )
            .into_response(),
        Ok(Err(_)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "the Studio window closed before answering" })),
        )
            .into_response(),
        Err(_) => {
            state
                .inner
                .waiters
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id);
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(json!({ "error": "Feather Studio did not answer in time" })),
            )
                .into_response()
        }
    }
}

pub fn router(state: CreativeMcpState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/creative/{tool}", get(get_snapshot))
        .route("/creative/{tool}/action", post(send_action))
        .with_state(state)
}

/// Loopback only. See the module comment for why this listener does not make
/// Studio a second path to a running game.
pub fn start(state: CreativeMcpState, port: u16) {
    tauri::async_runtime::spawn(async move {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                if let Err(error) = axum::serve(listener, router(state)).await {
                    eprintln!("[feather-studio] creative MCP endpoint stopped: {error}");
                }
            }
            Err(error) => {
                // Not fatal. Studio is fully usable without MCP.
                eprintln!("[feather-studio] creative MCP could not bind 127.0.0.1:{port}: {error}");
            }
        }
    });
}

#[tauri::command]
pub fn set_mcp_creative_snapshot(tool: String, snapshot: Value, state: tauri::State<CreativeMcpState>) {
    state.set_snapshot(&tool, snapshot);
}

#[tauri::command]
pub fn resolve_mcp_creative_request(
    id: String,
    ok: bool,
    response: Option<Value>,
    error: Option<String>,
    state: tauri::State<CreativeMcpState>,
) {
    state.resolve(&id, CreativeActionResponse { ok, response, error });
}

#[tauri::command]
pub fn get_studio_mcp_token(state: tauri::State<CreativeMcpState>) -> String {
    state.token()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshots_round_trip() {
        let state = CreativeMcpState::new();
        assert!(state.snapshot("shader-graph").is_none());
        state.set_snapshot("shader-graph", json!({ "nodes": 3 }));
        assert_eq!(state.snapshot("shader-graph"), Some(json!({ "nodes": 3 })));
    }

    #[test]
    fn each_launch_gets_its_own_token() {
        assert_ne!(CreativeMcpState::new().token(), CreativeMcpState::new().token());
    }

    #[test]
    fn resolving_an_unknown_request_is_harmless() {
        // A late answer after a timeout must not panic.
        CreativeMcpState::new().resolve(
            "gone",
            CreativeActionResponse { ok: true, response: None, error: None },
        );
    }
}
