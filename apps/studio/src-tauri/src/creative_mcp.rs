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
use std::path::PathBuf;
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
    // Unauthenticated, so it says what this is and nothing about the work.
    Json(json!({
        "app": "studio",
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "tools": tools,
        "features": ["creative-snapshots", "creative-actions"],
        "limits": { "actionTimeoutMs": ACTION_TIMEOUT.as_millis() as u64 },
    }))
    .into_response()
}

/// Where Studio publishes its per-launch token for the `feather mcp` gateway.
///
/// The token used to be readable only from inside Studio, so creative MCP use
/// meant copying it by hand into `--studio-token` after every launch. Inspector
/// already publishes its bridge token the same way (`~/.feather/mcp.json`).
pub fn published_config_path() -> PathBuf {
    if let Some(path) = std::env::var_os("FEATHER_STUDIO_MCP_CONFIG") {
        return PathBuf::from(path);
    }
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    match home {
        Some(home) => PathBuf::from(home).join(".feather").join("studio-mcp.json"),
        None => PathBuf::from(".feather").join("studio-mcp.json"),
    }
}

/// Write `{ token, url, pid }` readable by the user only. Failure is reported
/// and otherwise harmless: Studio works without MCP, and `--studio-token` still
/// works without the file.
fn publish_token(state: &CreativeMcpState, port: u16, path: &PathBuf) -> std::io::Result<()> {
    use std::io::Write;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(&json!({
        "token": state.token(),
        "url": format!("http://127.0.0.1:{port}"),
        "pid": std::process::id(),
    }))
    .map_err(std::io::Error::other)?;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(content.as_bytes())?;
    file.write_all(b"\n")
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
                let path = published_config_path();
                if let Err(error) = publish_token(&state, port, &path) {
                    eprintln!(
                        "[feather-studio] could not publish the MCP token to {}: {error}",
                        path.display()
                    );
                }
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
    fn the_published_token_is_the_running_token_and_private() {
        let state = CreativeMcpState::new();
        let path = std::env::temp_dir().join(format!("studio-mcp-test-{}.json", uuid::Uuid::new_v4()));
        publish_token(&state, 4007, &path).expect("publishing should succeed");
        let published: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(published["token"], state.token());
        assert_eq!(published["url"], "http://127.0.0.1:4007");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "the token file must be readable by its owner only");
        }
        let _ = std::fs::remove_file(path);
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
