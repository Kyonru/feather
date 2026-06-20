use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env,
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::{
    sync::oneshot,
    time::{timeout, Duration},
};
use uuid::Uuid;

use crate::ws_server::{AppId, Sessions};
use axum::extract::ws::Message;

const DEFAULT_BRIDGE_PORT: u16 = 4005;
const MAX_LOGS: usize = 500;
const MAX_PERFORMANCE: usize = 240;
const MAX_CONSOLE_RESPONSES: usize = 100;
const MAX_PLUGIN_ACTIONS: usize = 100;
const MAX_WAIT_MS: u64 = 10_000;

#[derive(Clone)]
pub struct McpBridgeState {
    inner: Arc<McpBridgeInner>,
}

struct McpBridgeInner {
    sessions: Sessions,
    app_id: AppId,
    settings: Mutex<McpBridgeSettings>,
    api_keys: Mutex<ApiKeys>,
    snapshots: Mutex<HashMap<String, SessionSnapshot>>,
    waiters: Mutex<Vec<ResponseWaiter>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpBridgeSettings {
    pub enabled: bool,
    pub token: String,
    pub bridge_url: String,
    pub config_path: String,
}

#[derive(Clone, Debug, Default)]
struct ApiKeys {
    default_api_key: String,
    session_api_keys: HashMap<String, String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    id: String,
    connected: bool,
    name: Option<String>,
    os: Option<String>,
    device_id: Option<String>,
    insecure: bool,
    last_message_type: Option<String>,
    updated_at: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    id: String,
    connected: bool,
    connected_at: u64,
    updated_at: u64,
    name: Option<String>,
    os: Option<String>,
    device_id: Option<String>,
    insecure: bool,
    last_message_type: Option<String>,
    config: Option<Value>,
    logs: Vec<Value>,
    performance: Vec<Value>,
    profiler: Option<Value>,
    observers: Option<Value>,
    assets: Option<Value>,
    plugins: HashMap<String, Value>,
    plugin_actions: Vec<Value>,
    debugger_status: Option<Value>,
    debugger_paused: Option<Value>,
    console: Vec<Value>,
    console_globals: Option<Value>,
    console_pins: Option<Value>,
    console_inspect: Option<Value>,
    time_travel: Option<Value>,
    time_travel_frames: Option<Value>,
    session_replay: Option<Value>,
    session_replay_recording: Option<Value>,
    session_replay_list: Option<Value>,
    hot_reload: Option<Value>,
}

impl SessionSnapshot {
    fn new(session_id: String) -> Self {
        let now = now_ms();
        Self {
            id: session_id,
            connected: true,
            connected_at: now,
            updated_at: now,
            name: None,
            os: None,
            device_id: None,
            insecure: false,
            last_message_type: None,
            config: None,
            logs: Vec::new(),
            performance: Vec::new(),
            profiler: None,
            observers: None,
            assets: None,
            plugins: HashMap::new(),
            plugin_actions: Vec::new(),
            debugger_status: None,
            debugger_paused: None,
            console: Vec::new(),
            console_globals: None,
            console_pins: None,
            console_inspect: None,
            time_travel: None,
            time_travel_frames: None,
            session_replay: None,
            session_replay_recording: None,
            session_replay_list: None,
            hot_reload: None,
        }
    }

    fn summary(&self) -> SessionSummary {
        SessionSummary {
            id: self.id.clone(),
            connected: self.connected,
            name: self.name.clone(),
            os: self.os.clone(),
            device_id: self.device_id.clone(),
            insecure: self.insecure,
            last_message_type: self.last_message_type.clone(),
            updated_at: self.updated_at,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRequest {
    message: Value,
    wait_for: Option<WaitCondition>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitCondition {
    #[serde(rename = "type")]
    message_type: Option<String>,
    id: Option<String>,
    plugin: Option<String>,
    action: Option<String>,
    timeout_ms: Option<u64>,
}

struct ResponseWaiter {
    session_id: String,
    condition: WaitCondition,
    sender: oneshot::Sender<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandResponse {
    ok: bool,
    response: Option<Value>,
}

pub fn default_bridge_url() -> String {
    format!("http://127.0.0.1:{DEFAULT_BRIDGE_PORT}")
}

pub fn shared_config_path() -> PathBuf {
    if let Some(path) = env::var_os("FEATHER_MCP_CONFIG") {
        return PathBuf::from(path);
    }

    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        return PathBuf::from(home).join(".feather").join("mcp.json");
    }

    PathBuf::from(".feather").join("mcp.json")
}

pub fn new_state(sessions: Sessions, app_id: AppId) -> McpBridgeState {
    let config_path = shared_config_path();
    let bridge_url = env::var("FEATHER_MCP_BRIDGE_URL").unwrap_or_else(|_| default_bridge_url());
    let mut settings = read_settings(&config_path).unwrap_or_else(|| McpBridgeSettings {
        enabled: false,
        token: generate_token(),
        bridge_url: bridge_url.clone(),
        config_path: config_path.to_string_lossy().to_string(),
    });
    if settings.token.is_empty() {
        settings.token = generate_token();
    }
    settings.bridge_url = bridge_url;
    settings.config_path = config_path.to_string_lossy().to_string();

    let state = McpBridgeState {
        inner: Arc::new(McpBridgeInner {
            sessions,
            app_id,
            settings: Mutex::new(settings),
            api_keys: Mutex::new(ApiKeys::default()),
            snapshots: Mutex::new(HashMap::new()),
            waiters: Mutex::new(Vec::new()),
        }),
    };

    let _ = state.persist_settings();
    state
}

pub fn start(state: McpBridgeState, port: u16) {
    tauri::async_runtime::spawn(async move {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .expect("failed to bind MCP bridge");
        let app = router(state);
        axum::serve(listener, app)
            .await
            .expect("MCP bridge server error");
    });
}

pub fn router(state: McpBridgeState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/sessions", get(list_sessions))
        .route("/sessions/{session_id}", get(get_session))
        .route("/sessions/{session_id}/command", post(send_command_to_session))
        .with_state(state)
}

#[tauri::command]
pub fn get_mcp_bridge_settings(state: tauri::State<McpBridgeState>) -> McpBridgeSettings {
    state.settings()
}

#[tauri::command]
pub fn set_mcp_bridge_enabled(
    enabled: bool,
    state: tauri::State<McpBridgeState>,
) -> Result<McpBridgeSettings, String> {
    state.set_enabled(enabled)
}

#[tauri::command]
pub fn regenerate_mcp_bridge_token(
    state: tauri::State<McpBridgeState>,
) -> Result<McpBridgeSettings, String> {
    state.regenerate_token()
}

#[tauri::command]
pub fn set_mcp_api_keys(
    api_key: String,
    session_api_keys: HashMap<String, String>,
    state: tauri::State<McpBridgeState>,
) {
    state.set_api_keys(api_key, session_api_keys);
}

impl McpBridgeState {
    pub fn settings(&self) -> McpBridgeSettings {
        self.inner
            .settings
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<McpBridgeSettings, String> {
        {
            let mut settings = self.inner.settings.lock().map_err(|e| e.to_string())?;
            settings.enabled = enabled;
        }
        self.persist_settings()?;
        Ok(self.settings())
    }

    pub fn regenerate_token(&self) -> Result<McpBridgeSettings, String> {
        {
            let mut settings = self.inner.settings.lock().map_err(|e| e.to_string())?;
            settings.token = generate_token();
        }
        self.persist_settings()?;
        Ok(self.settings())
    }

    pub fn set_api_keys(&self, default_api_key: String, session_api_keys: HashMap<String, String>) {
        let mut keys = self.inner.api_keys.lock().unwrap_or_else(|e| e.into_inner());
        keys.default_api_key = default_api_key;
        keys.session_api_keys = session_api_keys;
    }

    pub fn session_started(&self, session_id: &str) {
        let mut snapshots = self.inner.snapshots.lock().unwrap_or_else(|e| e.into_inner());
        snapshots
            .entry(session_id.to_string())
            .or_insert_with(|| SessionSnapshot::new(session_id.to_string()))
            .connected = true;
    }

    pub fn session_ended(&self, session_id: &str) {
        let mut snapshots = self.inner.snapshots.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(snapshot) = snapshots.get_mut(session_id) {
            snapshot.connected = false;
            snapshot.updated_at = now_ms();
        }
    }

    pub fn record_message(&self, payload: &str) {
        let Ok(mut value) = serde_json::from_str::<Value>(payload) else {
            return;
        };
        redact_secrets(&mut value);
        let Some(session_id) = value
            .get("_session")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            return;
        };

        let message_type = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let data = value.get("data").cloned();

        {
            let mut snapshots = self.inner.snapshots.lock().unwrap_or_else(|e| e.into_inner());
            let snapshot = snapshots
                .entry(session_id.clone())
                .or_insert_with(|| SessionSnapshot::new(session_id.clone()));
            snapshot.connected = true;
            snapshot.updated_at = now_ms();
            snapshot.last_message_type = Some(message_type.clone());

            match message_type.as_str() {
                "feather:hello" => {
                    let config = data.unwrap_or_else(|| {
                        value
                            .as_object()
                            .and_then(|object| object.get("config").cloned())
                            .unwrap_or(Value::Null)
                    });
                    if config != Value::Null {
                        snapshot.name = config
                            .get("sessionName")
                            .and_then(Value::as_str)
                            .map(str::to_string)
                            .or_else(|| {
                                config
                                    .get("root_path")
                                    .and_then(Value::as_str)
                                    .and_then(|path| path.rsplit('/').next())
                                    .map(str::to_string)
                            });
                        snapshot.os = config
                            .get("sysInfo")
                            .and_then(|sys| sys.get("os"))
                            .and_then(Value::as_str)
                            .map(str::to_string);
                        snapshot.device_id = config
                            .get("deviceId")
                            .and_then(Value::as_str)
                            .map(str::to_string);
                        snapshot.insecure = config
                            .get("security")
                            .and_then(|security| security.get("__DANGEROUS_INSECURE_CONNECTION__"))
                            .and_then(Value::as_bool)
                            .unwrap_or(false);
                        snapshot.config = Some(config);
                    }
                }
                "log" => push_capped(&mut snapshot.logs, data.unwrap_or(value.clone()), MAX_LOGS),
                "log:update" => push_capped(&mut snapshot.logs, data.unwrap_or(value.clone()), MAX_LOGS),
                "logs" => {
                    if let Some(Value::Array(entries)) = data {
                        for entry in entries {
                            push_capped(&mut snapshot.logs, entry, MAX_LOGS);
                        }
                    }
                }
                "performance" => push_capped(
                    &mut snapshot.performance,
                    data.unwrap_or(value.clone()),
                    MAX_PERFORMANCE,
                ),
                "profiler" => snapshot.profiler = data,
                "observe" => snapshot.observers = data,
                "assets" => snapshot.assets = data,
                "plugin" => {
                    if let Some(plugin) = value.get("plugin").and_then(Value::as_str) {
                        if let Some(data) = data {
                            snapshot.plugins.insert(plugin.to_string(), data);
                        }
                    }
                }
                "plugin:action:response" => {
                    push_capped(&mut snapshot.plugin_actions, value.clone(), MAX_PLUGIN_ACTIONS);
                    if let Some(plugin) = value.get("plugin").and_then(Value::as_str) {
                        if let Some(data) = value.get("data").cloned() {
                            snapshot.plugins.insert(plugin.to_string(), data);
                        }
                    }
                }
                "debugger:status" => snapshot.debugger_status = data,
                "debugger:paused" => snapshot.debugger_paused = data,
                "debugger:frame" => snapshot.debugger_paused = data,
                "debugger:resumed" => snapshot.debugger_paused = None,
                "eval:response" => push_capped(&mut snapshot.console, value.clone(), MAX_CONSOLE_RESPONSES),
                "console:globals" => snapshot.console_globals = data,
                "console:pins" => snapshot.console_pins = data,
                "console:inspect_result" => snapshot.console_inspect = data,
                "time_travel:status" => snapshot.time_travel = data,
                "time_travel:frames" => snapshot.time_travel_frames = data,
                "session_replay:status" => snapshot.session_replay = data,
                "session_replay:recording" => snapshot.session_replay_recording = data,
                "session_replay:list" => snapshot.session_replay_list = data,
                "hot_reload:state" | "hot_reload:result" => snapshot.hot_reload = data,
                _ => {}
            }
        }

        self.resolve_waiters(&session_id, &value);
    }

    fn persist_settings(&self) -> Result<(), String> {
        let settings = self.settings();
        let path = PathBuf::from(&settings.config_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let content = serde_json::to_string_pretty(&settings).map_err(|err| err.to_string())?;
        fs::write(path, format!("{content}\n")).map_err(|err| err.to_string())
    }

    fn effective_api_key(&self, session_id: &str) -> Option<String> {
        let keys = self.inner.api_keys.lock().unwrap_or_else(|e| e.into_inner());
        let value = keys
            .session_api_keys
            .get(session_id)
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .unwrap_or_else(|| keys.default_api_key.clone());
        if value.trim().is_empty() {
            None
        } else {
            Some(value)
        }
    }

    async fn dispatch_command(
        &self,
        session_id: &str,
        request: CommandRequest,
    ) -> Result<CommandResponse, Response> {
        let mut message = request.message;
        if !message.is_object() {
            return Err(error_response(StatusCode::BAD_REQUEST, "command message must be a JSON object"));
        }
        strip_command_secrets(&mut message);
        self.attach_command_auth(session_id, &mut message);

        let wait_for = request.wait_for.clone();
        let waiter = if let Some(condition) = wait_for {
            let (sender, receiver) = oneshot::channel();
            self.inner
                .waiters
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(ResponseWaiter {
                    session_id: session_id.to_string(),
                    condition,
                    sender,
                });
            Some(receiver)
        } else {
            None
        };

        {
            let sessions = self.inner.sessions.lock().map_err(|e| {
                error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("session lock failed: {e}"))
            })?;
            let Some(session) = sessions.get(session_id) else {
                return Err(error_response(StatusCode::NOT_FOUND, "session is not connected"));
            };
            session
                .sender
                .send(Message::Text(message.to_string().into()))
                .map_err(|err| error_response(StatusCode::BAD_GATEWAY, &err.to_string()))?;
        }

        if let Some(receiver) = waiter {
            let wait_ms = request
                .wait_for
                .as_ref()
                .and_then(|condition| condition.timeout_ms)
                .unwrap_or(2_000)
                .min(MAX_WAIT_MS);
            match timeout(Duration::from_millis(wait_ms), receiver).await {
                Ok(Ok(response)) => Ok(CommandResponse {
                    ok: true,
                    response: Some(response),
                }),
                Ok(Err(_)) => Ok(CommandResponse {
                    ok: false,
                    response: None,
                }),
                Err(_) => Ok(CommandResponse {
                    ok: false,
                    response: None,
                }),
            }
        } else {
            Ok(CommandResponse {
                ok: true,
                response: None,
            })
        }
    }

    fn attach_command_auth(&self, session_id: &str, message: &mut Value) {
        let Some(object) = message.as_object_mut() else {
            return;
        };

        let app_id = self
            .inner
            .app_id
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if !app_id.is_empty() {
            object.insert("appId".to_string(), Value::String(app_id));
        }

        let command_type = object
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let plugin = object
            .get("plugin")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let needs_api_key = command_type == "cmd:eval"
            || command_type == "cmd:console:pin"
            || (command_type == "cmd:plugin:set_enabled" && plugin == "console");

        if needs_api_key {
            if let Some(api_key) = self.effective_api_key(session_id) {
                object.insert("apiKey".to_string(), Value::String(api_key));
            }
        }
    }

    fn resolve_waiters(&self, session_id: &str, message: &Value) {
        let mut waiters = self.inner.waiters.lock().unwrap_or_else(|e| e.into_inner());
        let mut index = 0;
        while index < waiters.len() {
            if waiters[index].session_id == session_id && waiters[index].condition.matches(message) {
                let waiter = waiters.remove(index);
                let _ = waiter.sender.send(message.clone());
            } else {
                index += 1;
            }
        }
    }
}

impl WaitCondition {
    fn matches(&self, message: &Value) -> bool {
        if let Some(expected) = &self.message_type {
            if message.get("type").and_then(Value::as_str) != Some(expected.as_str()) {
                return false;
            }
        }
        if let Some(expected) = &self.id {
            if message.get("id").and_then(value_to_string).as_deref() != Some(expected.as_str()) {
                return false;
            }
        }
        if let Some(expected) = &self.plugin {
            if message.get("plugin").and_then(Value::as_str) != Some(expected.as_str()) {
                return false;
            }
        }
        if let Some(expected) = &self.action {
            if message.get("action").and_then(Value::as_str) != Some(expected.as_str()) {
                return false;
            }
        }
        true
    }
}

async fn health(headers: HeaderMap, State(state): State<McpBridgeState>) -> Response {
    if let Err(response) = authorize(&headers, &state) {
        return response;
    }
    let settings = state.settings();
    Json(json!({
        "ok": true,
        "enabled": settings.enabled,
        "bridgeUrl": settings.bridge_url,
    }))
    .into_response()
}

async fn list_sessions(headers: HeaderMap, State(state): State<McpBridgeState>) -> Response {
    if let Err(response) = authorize(&headers, &state) {
        return response;
    }
    let snapshots = state.inner.snapshots.lock().unwrap_or_else(|e| e.into_inner());
    let sessions: Vec<SessionSummary> = snapshots.values().map(SessionSnapshot::summary).collect();
    Json(json!({ "sessions": sessions })).into_response()
}

async fn get_session(
    headers: HeaderMap,
    State(state): State<McpBridgeState>,
    Path(session_id): Path<String>,
) -> Response {
    if let Err(response) = authorize(&headers, &state) {
        return response;
    }
    let snapshots = state.inner.snapshots.lock().unwrap_or_else(|e| e.into_inner());
    let Some(snapshot) = snapshots.get(&session_id) else {
        return error_response(StatusCode::NOT_FOUND, "session snapshot was not found");
    };
    Json(snapshot).into_response()
}

async fn send_command_to_session(
    headers: HeaderMap,
    State(state): State<McpBridgeState>,
    Path(session_id): Path<String>,
    Json(request): Json<CommandRequest>,
) -> Response {
    if let Err(response) = authorize(&headers, &state) {
        return response;
    }
    match state.dispatch_command(&session_id, request).await {
        Ok(response) => Json(response).into_response(),
        Err(response) => response,
    }
}

fn authorize(headers: &HeaderMap, state: &McpBridgeState) -> Result<(), Response> {
    let settings = state.settings();
    if !settings.enabled {
        return Err(error_response(StatusCode::FORBIDDEN, "MCP bridge is disabled"));
    }
    if !origin_allowed(headers) {
        return Err(error_response(StatusCode::FORBIDDEN, "origin is not allowed"));
    }

    let expected = settings.token;
    let Some(auth) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    else {
        return Err(error_response(StatusCode::UNAUTHORIZED, "missing bearer token"));
    };

    let token = auth.strip_prefix("Bearer ").unwrap_or_default();
    if expected.is_empty() || token != expected {
        return Err(error_response(StatusCode::UNAUTHORIZED, "invalid bearer token"));
    }

    Ok(())
}

fn origin_allowed(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok()) else {
        return true;
    };
    origin.starts_with("http://127.0.0.1:")
        || origin.starts_with("http://localhost:")
        || origin == "http://127.0.0.1"
        || origin == "http://localhost"
}

fn read_settings(path: &PathBuf) -> Option<McpBridgeSettings> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn generate_token() -> String {
    format!("feather-mcp-{}", Uuid::new_v4())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn push_capped(values: &mut Vec<Value>, value: Value, max: usize) {
    values.push(value);
    if values.len() > max {
        values.drain(0..(values.len() - max));
    }
}

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn strip_command_secrets(message: &mut Value) {
    if let Some(object) = message.as_object_mut() {
        for key in ["appId", "apiKey", "token", "password", "secret", "authorization"] {
            object.remove(key);
        }
    }
}

fn redact_secrets(value: &mut Value) {
    match value {
        Value::Object(object) => {
            let keys: Vec<String> = object.keys().cloned().collect();
            for key in keys {
                if is_secret_key(&key) {
                    object.insert(key, Value::String("[redacted]".to_string()));
                } else if let Some(child) = object.get_mut(&key) {
                    redact_secrets(child);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                redact_secrets(item);
            }
        }
        _ => {}
    }
}

fn is_secret_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    normalized == "appid"
        || normalized == "apikey"
        || normalized == "token"
        || normalized == "authorization"
        || normalized.contains("password")
        || normalized.contains("secret")
}

fn error_response(status: StatusCode, message: &str) -> Response {
    (status, Json(ErrorPayload { error: message.to_string() })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::ws::Message;
    use tokio::sync::mpsc;

    fn test_state() -> (McpBridgeState, mpsc::UnboundedReceiver<Message>) {
        let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
        let app_id: AppId = Arc::new(Mutex::new("desktop-app".to_string()));
        let state = new_state(sessions.clone(), app_id);
        {
            let mut settings = state.inner.settings.lock().unwrap();
            settings.enabled = true;
            settings.token = "test-token".to_string();
        }
        let (tx, rx) = mpsc::unbounded_channel();
        sessions.lock().unwrap().insert(
            "s1".to_string(),
            crate::ws_server::SessionData { sender: tx },
        );
        state.session_started("s1");
        (state, rx)
    }

    #[test]
    fn disabled_bridge_rejects_authorization() {
        let (state, _) = test_state();
        state.set_enabled(false).unwrap();
        let headers = HeaderMap::new();
        let response = authorize(&headers, &state).unwrap_err();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn bearer_token_is_required() {
        let (state, _) = test_state();
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, "Bearer wrong".parse().unwrap());
        let response = authorize(&headers, &state).unwrap_err();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn snapshots_are_sanitized() {
        let (state, _) = test_state();
        state.record_message(
            r#"{"_session":"s1","type":"feather:hello","data":{"sessionName":"Game","apiKey":"secret","security":{"appId":"secret","__DANGEROUS_INSECURE_CONNECTION__":true}}}"#,
        );
        let snapshot = state.inner.snapshots.lock().unwrap().get("s1").unwrap().clone();
        assert_eq!(snapshot.name.as_deref(), Some("Game"));
        assert_eq!(
            snapshot
                .config
                .as_ref()
                .unwrap()
                .get("apiKey")
                .and_then(Value::as_str),
            Some("[redacted]")
        );
        assert!(snapshot.insecure);
    }

    #[tokio::test]
    async fn command_dispatch_strips_secrets_and_attaches_auth() {
        let (state, mut rx) = test_state();
        state.set_api_keys("console-key".to_string(), HashMap::new());
        let result = state
            .dispatch_command(
                "s1",
                CommandRequest {
                    message: json!({
                        "type": "cmd:eval",
                        "code": "return 1",
                        "apiKey": "caller",
                        "appId": "caller"
                    }),
                    wait_for: None,
                },
            )
            .await
            .unwrap();
        assert!(result.ok);
        let sent = rx.recv().await.unwrap();
        let text = match sent {
            Message::Text(text) => text,
            other => panic!("expected text message, got {other:?}"),
        };
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["appId"], "desktop-app");
        assert_eq!(value["apiKey"], "console-key");
    }

    #[test]
    fn waiters_match_response_shape() {
        let (state, _) = test_state();
        let (tx, mut rx) = oneshot::channel();
        state.inner.waiters.lock().unwrap().push(ResponseWaiter {
            session_id: "s1".to_string(),
            condition: WaitCondition {
                message_type: Some("eval:response".to_string()),
                id: Some("eval-1".to_string()),
                plugin: None,
                action: None,
                timeout_ms: None,
            },
            sender: tx,
        });
        state.record_message(r#"{"_session":"s1","type":"eval:response","id":"eval-1","status":"success"}"#);
        assert_eq!(rx.try_recv().unwrap()["status"], "success");
    }
}
