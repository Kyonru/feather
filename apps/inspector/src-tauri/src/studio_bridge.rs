//! The Inspector side of the Feather Studio bridge.
//!
//! Feather Studio is a separate installed application. It edits shaders,
//! textures and particles locally and does not own game sessions — Inspector
//! does. When Studio wants to preview work in a running game it asks here.
//!
//! Four properties this endpoint has to hold, because a request that reaches
//! this far can act inside someone's game:
//!
//! * **Loopback only.** Bound to 127.0.0.1, never a wildcard, so the bridge is
//!   not reachable from the network the way the game WebSocket deliberately is.
//! * **Capability gated.** Everything except the handshake requires a
//!   short-lived token this process issued. Tokens live in memory only and die
//!   with the process; each carries a grant record (methods, session scope,
//!   expiry) and can be revoked on its own.
//! * **Narrow.** There is no generic send. Studio names a creative plugin and an
//!   action from `PREVIEW_ALLOWLIST`; Inspector builds the `cmd:plugin:action`
//!   itself. Eval, the debugger, Console, hot reload, packages and replay are
//!   unreachable by construction, not by filter.
//! * **Version negotiated first, input checked before forwarding.** An
//!   incompatible or malformed request is refused before it can name a
//!   method, and nothing reaches a game before its size and shape are known.
//!
//! The contract mirrored here is `packages/session-bridge/src/contract.ts`;
//! `pnpm run check:protocol` compares the version range, method names, error
//! codes, allowlist and size limits between the two.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::{routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use axum::extract::ws::Message;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use crate::ws_server::Sessions;

/// Keep in step with `BRIDGE_VERSION` in the TypeScript contract. v2 removed
/// the generic `session.send`; v1 peers are refused because they would still
/// expect it.
pub const BRIDGE_VERSION: u32 = 2;
pub const BRIDGE_MIN_SUPPORTED: u32 = 2;

pub const BRIDGE_METHODS: &[&str] = &[
    "handshake",
    "sessions.list",
    "sessions.select",
    "preview.send",
    "preview.cancel",
    "preferences.export",
    "capability.release",
];

pub const BRIDGE_SERVER_ERROR_CODES: &[&str] = &[
    "incompatible-version",
    "unauthenticated",
    "malformed",
    "payload-too-large",
    "unknown-method",
    "forbidden",
    "no-session",
    "selection-required",
    "stale-session",
    "rejected",
];

/// The whole of what a bridge capability can make a game do.
pub const PREVIEW_ALLOWLIST: &[(&str, &[&str])] = &[
    ("shader-graph", &["preview-shader", "clear-preview", "compile-shader"]),
    ("particle-system-playground", &["set-shader"]),
];

pub const BRIDGE_MAX_REQUEST_BYTES: usize = 8 * 1024 * 1024;
pub const BRIDGE_MAX_HANDSHAKE_BYTES: usize = 4096;
const BRIDGE_MAX_ID_LENGTH: usize = 128;
const BRIDGE_MAX_NAME_LENGTH: usize = 64;

/// Short enough that a leaked token is not a standing key to someone's game.
const CAPABILITY_TTL: Duration = Duration::from_secs(60 * 30);

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn allowed_preview(plugin: &str, action: &str) -> bool {
    PREVIEW_ALLOWLIST
        .iter()
        .any(|(p, actions)| *p == plugin && actions.contains(&action))
}

// --- capabilities ------------------------------------------------------------

/// One pairing. Mirrors `GrantRecord` in the TypeScript reference server.
#[derive(Clone, Debug)]
struct Grant {
    pairing_id: String,
    client_instance_id: String,
    client_version: String,
    bridge_version: u32,
    methods: Vec<&'static str>,
    session_id: Option<String>,
    issued_at: u64,
    expires_at: u64,
    last_used_at: u64,
}

/// What Inspector's pairing list shows. Never includes the token.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PairingSummary {
    pairing_id: String,
    client_version: String,
    client_instance_id: String,
    bridge_version: u32,
    methods: Vec<String>,
    session_id: Option<String>,
    issued_at: u64,
    expires_at: u64,
    last_used_at: u64,
}

#[derive(Clone, Default)]
pub struct BridgeCapabilities {
    /// token -> grant
    grants: Arc<Mutex<HashMap<String, Grant>>>,
}

impl BridgeCapabilities {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Grant>> {
        self.grants.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn issue(&self, client_instance_id: &str, client_version: &str, bridge_version: u32) -> (String, Grant) {
        let now = now_millis();
        let token = format!("studio-{}", uuid::Uuid::new_v4());
        let grant = Grant {
            pairing_id: format!("pairing-{}", uuid::Uuid::new_v4()),
            client_instance_id: client_instance_id.to_string(),
            client_version: client_version.to_string(),
            bridge_version,
            methods: BRIDGE_METHODS
                .iter()
                .copied()
                .filter(|method| *method != "handshake")
                .collect(),
            session_id: None,
            issued_at: now,
            expires_at: now + CAPABILITY_TTL.as_millis() as u64,
            last_used_at: now,
        };
        let mut grants = self.lock();
        // Drop anything already expired rather than letting the map grow, and
        // keep one standing capability per running Studio.
        grants.retain(|_, existing| existing.expires_at > now && existing.client_instance_id != client_instance_id);
        grants.insert(token.clone(), grant.clone());
        (token, grant)
    }

    /// The grant behind a token, if it is live. Touches `last_used_at`.
    fn authorize(&self, token: &str) -> Option<Grant> {
        let now = now_millis();
        let mut grants = self.lock();
        match grants.get_mut(token) {
            Some(grant) if grant.expires_at > now => {
                grant.last_used_at = now;
                Some(grant.clone())
            }
            Some(_) => {
                grants.remove(token);
                None
            }
            None => None,
        }
    }

    fn scope_to(&self, token: &str, session_id: &str) {
        if let Some(grant) = self.lock().get_mut(token) {
            grant.session_id = Some(session_id.to_string());
        }
    }

    fn release(&self, token: &str) {
        self.lock().remove(token);
    }

    /// Revoke one pairing; every other pairing keeps working.
    pub fn revoke(&self, pairing_id: &str) -> bool {
        let mut grants = self.lock();
        let before = grants.len();
        grants.retain(|_, grant| grant.pairing_id != pairing_id);
        grants.len() != before
    }

    /// Invalidate every outstanding capability; an in-flight Studio must
    /// re-handshake.
    #[cfg(test)]
    pub fn revoke_all(&self) {
        self.lock().clear();
    }

    pub fn pairings(&self) -> Vec<PairingSummary> {
        let now = now_millis();
        let mut grants = self.lock();
        grants.retain(|_, grant| grant.expires_at > now);
        let mut list: Vec<PairingSummary> = grants
            .values()
            .map(|grant| PairingSummary {
                pairing_id: grant.pairing_id.clone(),
                client_version: grant.client_version.clone(),
                client_instance_id: grant.client_instance_id.clone(),
                bridge_version: grant.bridge_version,
                methods: grant.methods.iter().map(|m| m.to_string()).collect(),
                session_id: grant.session_id.clone(),
                issued_at: grant.issued_at,
                expires_at: grant.expires_at,
                last_used_at: grant.last_used_at,
            })
            .collect();
        list.sort_by(|a, b| a.issued_at.cmp(&b.issued_at).then(a.pairing_id.cmp(&b.pairing_id)));
        list
    }

    #[cfg(test)]
    fn expire_all(&self) {
        for grant in self.lock().values_mut() {
            grant.expires_at = 0;
        }
    }
}

// --- the session directory -------------------------------------------------

/// Names and connection times for the sessions the WebSocket server holds.
///
/// The live set is always `Sessions` — that map is the truth about which games
/// are connected. The Inspector webview supplies the human names and the
/// `connectedAt` its own freshness checks use; until it has, a session is
/// stamped with the first time the bridge saw it.
#[derive(Clone, Default)]
pub struct SessionDirectory {
    meta: Arc<Mutex<HashMap<String, SessionMeta>>>,
    first_seen: Arc<Mutex<HashMap<String, u64>>>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetaInput {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    connected_at: Option<u64>,
}

#[derive(Clone, Debug, Default)]
struct SessionMeta {
    name: Option<String>,
    connected_at: Option<u64>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SessionSummary {
    id: String,
    name: Option<String>,
    connected_at: u64,
}

impl SessionDirectory {
    pub fn set_meta(&self, entries: Vec<SessionMetaInput>) {
        let mut meta = self.meta.lock().unwrap_or_else(|e| e.into_inner());
        meta.clear();
        for entry in entries.into_iter().take(256) {
            if entry.id.is_empty() || entry.id.len() > BRIDGE_MAX_ID_LENGTH {
                continue;
            }
            let name = entry
                .name
                .map(|name| name.trim().chars().take(120).collect::<String>())
                .filter(|name| !name.is_empty());
            meta.insert(entry.id, SessionMeta { name, connected_at: entry.connected_at });
        }
    }

    /// Connected sessions, oldest first, ties by id — never `HashMap` order.
    fn list(&self, sessions: &Sessions) -> Vec<SessionSummary> {
        let ids: Vec<String> = {
            let sessions = sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions.keys().cloned().collect()
        };
        let now = now_millis();
        let mut first_seen = self.first_seen.lock().unwrap_or_else(|e| e.into_inner());
        first_seen.retain(|id, _| ids.contains(id));
        let meta = self.meta.lock().unwrap_or_else(|e| e.into_inner());

        let mut list: Vec<SessionSummary> = ids
            .into_iter()
            .map(|id| {
                let seen = *first_seen.entry(id.clone()).or_insert(now);
                let entry = meta.get(&id).cloned().unwrap_or_default();
                SessionSummary {
                    connected_at: entry.connected_at.unwrap_or(seen),
                    name: entry.name,
                    id,
                }
            })
            .collect();
        list.sort_by(|a, b| a.connected_at.cmp(&b.connected_at).then(a.id.cmp(&b.id)));
        list
    }
}

// --- preferences relay -------------------------------------------------------

/// Relays a one-time preferences export from the Inspector webview.
///
/// Studio is a separately installed application with its own storage origin, so
/// it can never read Inspector's `settings-storage` key. On first pairing it
/// asks for the payload instead, and Inspector answers from the copy the 05a
/// migration deliberately never deleted.
#[derive(Clone, Default)]
pub struct PreferencesExporter {
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    waiters: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
}

impl PreferencesExporter {
    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.app_handle.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle);
    }

    pub fn resolve(&self, id: &str, payload: Value) {
        if let Some(sender) = self
            .waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(id)
        {
            let _ = sender.send(payload);
        }
    }

    async fn export(&self) -> Option<Value> {
        let handle = self
            .app_handle
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()?;

        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        self.waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id.clone(), tx);

        if handle
            .emit("feather://export-studio-preferences", json!({ "id": id }))
            .is_err()
        {
            self.waiters
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id);
            return None;
        }

        match tokio::time::timeout(Duration::from_secs(10), rx).await {
            Ok(Ok(payload)) => Some(payload),
            _ => {
                self.waiters
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&id);
                None
            }
        }
    }
}

// --- request handling ----------------------------------------------------------

#[derive(Clone)]
pub struct BridgeState {
    sessions: Sessions,
    capabilities: BridgeCapabilities,
    directory: SessionDirectory,
    server_version: String,
    /// Needed for `preferences.export`: the payload lives in the Inspector
    /// webview's local storage, which this process cannot read directly.
    exporter: PreferencesExporter,
}

impl BridgeState {
    pub fn new(
        sessions: Sessions,
        capabilities: BridgeCapabilities,
        directory: SessionDirectory,
        server_version: String,
        exporter: PreferencesExporter,
    ) -> Self {
        Self { sessions, capabilities, directory, server_version, exporter }
    }
}

fn ok(id: &str, result: Value) -> Value {
    json!({ "id": id, "bridgeVersion": BRIDGE_VERSION, "ok": true, "result": result })
}

fn fail(id: &str, code: &str, message: &str) -> Value {
    debug_assert!(BRIDGE_SERVER_ERROR_CODES.contains(&code), "undeclared bridge error code {code}");
    json!({
        "id": id,
        "bridgeVersion": BRIDGE_VERSION,
        "ok": false,
        "error": { "code": code, "message": message },
    })
}

/// Mirrors `negotiate()` in the TypeScript contract: a range overlap, not
/// equality. Equality would force the two applications to release together,
/// which is the coupling v4 exists to remove.
fn negotiate(remote_version: u32, remote_min: u32) -> Result<u32, String> {
    let shared = BRIDGE_VERSION.min(remote_version);
    if shared < BRIDGE_MIN_SUPPORTED || shared < remote_min {
        return Err(format!(
            "No shared bridge version. Inspector speaks v{BRIDGE_MIN_SUPPORTED}–v{BRIDGE_VERSION}; \
             Studio speaks v{remote_min}–v{remote_version}. Update the older application."
        ));
    }
    Ok(shared)
}

fn bounded_str<'a>(value: Option<&'a Value>, max: usize) -> Option<&'a str> {
    value
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty() && text.len() <= max)
}

fn ident(text: &str) -> bool {
    text.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
}

fn bounded_int(value: Option<&Value>) -> Option<u32> {
    value
        .and_then(Value::as_u64)
        .filter(|n| *n <= 1_000_000)
        .map(|n| n as u32)
}

struct PreviewTarget<'a> {
    session_id: &'a str,
    plugin: &'a str,
    action: &'a str,
}

fn preview_target<'a>(params: &'a Value, method: &str) -> Result<PreviewTarget<'a>, String> {
    if !params.is_object() {
        return Err(format!("{method} parameters must be an object."));
    }
    let session_id = bounded_str(params.get("sessionId"), BRIDGE_MAX_ID_LENGTH)
        .ok_or_else(|| format!("{method} needs a sessionId."))?;
    let plugin = bounded_str(params.get("plugin"), BRIDGE_MAX_NAME_LENGTH)
        .ok_or_else(|| format!("{method} needs a plugin id."))?;
    let action = bounded_str(params.get("action"), BRIDGE_MAX_NAME_LENGTH)
        .ok_or_else(|| format!("{method} needs an action."))?;
    Ok(PreviewTarget { session_id, plugin, action })
}

/// Turn one raw request body into a response. Everything the endpoint does is
/// here, so tests can drive it without a socket.
async fn process(state: &BridgeState, body: &[u8]) -> Value {
    if body.len() > BRIDGE_MAX_REQUEST_BYTES {
        return fail("", "payload-too-large", "The request is larger than the bridge accepts.");
    }
    let request: Value = match serde_json::from_slice(body) {
        Ok(value) => value,
        Err(_) => return fail("", "malformed", "The request is not valid JSON."),
    };
    if !request.is_object() {
        return fail("", "malformed", "The request must be a JSON object.");
    }
    let Some(id) = bounded_str(request.get("id"), BRIDGE_MAX_ID_LENGTH) else {
        return fail("", "malformed", "The request has no usable id.");
    };
    let Some(method) = request.get("method").and_then(Value::as_str) else {
        return fail(id, "malformed", "The request names no method.");
    };
    let params = request.get("params").cloned().unwrap_or(Value::Null);

    if method == "handshake" {
        if body.len() > BRIDGE_MAX_HANDSHAKE_BYTES {
            return fail(id, "payload-too-large", "The handshake is larger than the bridge accepts.");
        }
        if !params.is_object() {
            return fail(id, "malformed", "Handshake parameters must be an object.");
        }
        if params.get("client").and_then(Value::as_str) != Some("studio") {
            return fail(id, "malformed", "Only Feather Studio may pair with Inspector.");
        }
        let Some(client_version) =
            bounded_str(params.get("clientVersion"), BRIDGE_MAX_NAME_LENGTH).filter(|v| ident(v))
        else {
            return fail(id, "malformed", "Handshake is missing a valid clientVersion.");
        };
        let Some(client_instance_id) =
            bounded_str(params.get("clientInstanceId"), BRIDGE_MAX_ID_LENGTH).filter(|v| ident(v))
        else {
            return fail(id, "malformed", "Handshake is missing a valid clientInstanceId.");
        };
        let (Some(remote_version), Some(remote_min)) =
            (bounded_int(params.get("bridgeVersion")), bounded_int(params.get("minSupported")))
        else {
            return fail(id, "malformed", "Handshake bridge versions must be whole numbers.");
        };

        return match negotiate(remote_version, remote_min) {
            Err(message) => fail(id, "incompatible-version", &message),
            Ok(version) => {
                let (capability, grant) = state.capabilities.issue(client_instance_id, client_version, version);
                let plugins: Map<String, Value> = PREVIEW_ALLOWLIST
                    .iter()
                    .map(|(plugin, actions)| (plugin.to_string(), json!(actions)))
                    .collect();
                ok(
                    id,
                    json!({
                        "server": "inspector",
                        "serverVersion": state.server_version,
                        "bridgeVersion": version,
                        "capability": capability,
                        "expiresAt": grant.expires_at,
                        "grant": {
                            "pairingId": grant.pairing_id,
                            "bridgeVersion": version,
                            "methods": grant.methods,
                            "plugins": plugins,
                            "sessionId": Value::Null,
                            "expiresAt": grant.expires_at,
                        },
                    }),
                )
            }
        };
    }

    let token = request.get("capability").and_then(Value::as_str).unwrap_or("");
    let Some(grant) = (if token.is_empty() { None } else { state.capabilities.authorize(token) }) else {
        return fail(id, "unauthenticated", "Missing or expired Inspector capability. Reconnect.");
    };

    if !BRIDGE_METHODS.contains(&method) {
        return fail(id, "unknown-method", &format!("Unrecognized bridge method \"{method}\"."));
    }
    if !grant.methods.contains(&method) {
        return fail(id, "forbidden", &format!("This pairing may not call \"{method}\"."));
    }

    match method {
        "sessions.list" => {
            let sessions = state.directory.list(&state.sessions);
            let selected = grant
                .session_id
                .filter(|scope| sessions.iter().any(|session| &session.id == scope));
            ok(id, json!({ "sessions": sessions, "selectedSessionId": selected }))
        }

        "sessions.select" => {
            let Some(session_id) = bounded_str(params.get("sessionId"), BRIDGE_MAX_ID_LENGTH) else {
                return fail(id, "malformed", "sessions.select needs a sessionId.");
            };
            let sessions = state.directory.list(&state.sessions);
            match sessions.into_iter().find(|session| session.id == session_id) {
                Some(session) => {
                    state.capabilities.scope_to(token, &session.id);
                    ok(id, json!(session))
                }
                None => fail(id, "stale-session", "That game is no longer connected to Feather Inspector."),
            }
        }

        "preview.send" | "preview.cancel" => {
            let is_send = method == "preview.send";
            let target = match preview_target(&params, method) {
                Ok(target) => target,
                Err(message) => return fail(id, "malformed", &message),
            };
            let preview_params = params.get("params").cloned().unwrap_or_else(|| json!({}));
            if is_send && !preview_params.is_object() {
                return fail(id, "malformed", "preview.send params must be an object.");
            }
            if !allowed_preview(target.plugin, target.action) {
                return fail(
                    id,
                    "forbidden",
                    &format!(
                        "\"{}:{}\" is not a creative preview this bridge can send.",
                        target.plugin, target.action
                    ),
                );
            }

            // The pairing's scope is the only target; see `resolvePreviewTarget`.
            let connected = state.directory.list(&state.sessions);
            let Some(scope) = grant.session_id.as_deref() else {
                return if connected.is_empty() {
                    fail(id, "no-session", "Feather Inspector has no game attached.")
                } else {
                    fail(id, "selection-required", "Choose which game to preview in before sending.")
                };
            };
            if target.session_id != scope {
                return fail(id, "forbidden", "That game is outside this pairing. Select it first.");
            }
            if !connected.iter().any(|session| session.id == scope) {
                return fail(
                    id,
                    "stale-session",
                    "The game this pairing previewed into has disconnected or restarted.",
                );
            }

            // Built here, never taken from the caller: these two shapes are the
            // only commands a bridge request can become. The requestId follows
            // the shared correlation contract — the runtime echoes it.
            let request_id = format!("studio-{}", uuid::Uuid::new_v4());
            let command = if is_send {
                json!({
                    "type": "cmd:plugin:action",
                    "plugin": target.plugin,
                    "action": target.action,
                    "params": preview_params,
                    "requestId": request_id,
                })
            } else {
                json!({
                    "type": "cmd:plugin:action:cancel",
                    "plugin": target.plugin,
                    "action": target.action,
                    "requestId": request_id,
                })
            };

            let sessions = state.sessions.lock().unwrap_or_else(|e| e.into_inner());
            let Some(session) = sessions.get(scope) else {
                return fail(id, "stale-session", "The game this pairing previewed into has disconnected.");
            };
            match session.sender.send(Message::Text(command.to_string().into())) {
                Ok(()) => ok(id, json!({ "requestId": request_id })),
                Err(error) => fail(id, "rejected", &error.to_string()),
            }
        }

        // Answered by the Inspector webview, which holds the legacy payload.
        // Null means "nothing to hand over", which is the normal case for a
        // fresh install and is not an error.
        "preferences.export" => match state.exporter.export().await {
            Some(payload) => ok(id, payload),
            None => ok(id, Value::Null),
        },

        "capability.release" => {
            state.capabilities.release(token);
            ok(id, Value::Null)
        }

        other => fail(id, "unknown-method", &format!("Unrecognized bridge method \"{other}\".")),
    }
}

/// Where Studio's webview runs: the packaged app on each platform, and its dev
/// server. A browser page from anywhere else cannot drive the bridge — the
/// JSON content type forces a preflight, and the preflight is refused.
const ALLOWED_ORIGINS: &[&str] = &[
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:1430",
    "http://127.0.0.1:1430",
];

/// `Ok(None)` for a request with no Origin (a local process, not a browser),
/// `Ok(Some)` for Studio's webview, `Err` for any other web page.
fn checked_origin(headers: &HeaderMap) -> Result<Option<HeaderValue>, ()> {
    match headers.get(header::ORIGIN) {
        None => Ok(None),
        Some(origin) if ALLOWED_ORIGINS.iter().any(|allowed| origin.as_bytes() == allowed.as_bytes()) => {
            Ok(Some(origin.clone()))
        }
        Some(_) => Err(()),
    }
}

fn with_cors(mut response: Response, origin: Option<HeaderValue>) -> Response {
    if let Some(origin) = origin {
        let headers = response.headers_mut();
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        headers.insert(header::VARY, HeaderValue::from_static("origin"));
    }
    response
}

async fn preflight(headers: HeaderMap) -> Response {
    match checked_origin(&headers) {
        Ok(origin) => {
            let mut response = StatusCode::NO_CONTENT.into_response();
            let out = response.headers_mut();
            out.insert(header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("POST"));
            out.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("content-type"));
            out.insert(header::ACCESS_CONTROL_MAX_AGE, HeaderValue::from_static("600"));
            with_cors(response, origin)
        }
        Err(()) => StatusCode::FORBIDDEN.into_response(),
    }
}

async fn handle(State(state): State<BridgeState>, headers: HeaderMap, body: Bytes) -> Response {
    let Ok(origin) = checked_origin(&headers) else {
        return (StatusCode::FORBIDDEN, "This origin may not use the Feather Studio bridge.").into_response();
    };
    let json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.starts_with("application/json"))
        .unwrap_or(false);
    if !json {
        return with_cors(
            (StatusCode::UNSUPPORTED_MEDIA_TYPE, "The Studio bridge accepts application/json only.").into_response(),
            origin,
        );
    }
    with_cors(Json(process(&state, &body).await).into_response(), origin)
}

fn router(state: BridgeState) -> Router {
    Router::new()
        .route("/bridge", post(handle).options(preflight))
        // Refused before the body is buffered; Studio reports it by name.
        .layer(DefaultBodyLimit::max(BRIDGE_MAX_REQUEST_BYTES))
        .with_state(state)
}

/// Start the loopback bridge listener.
///
/// Bound to 127.0.0.1 on purpose. The game WebSocket binds 0.0.0.0 because
/// devices on the LAN legitimately connect to it; this one must not, because it
/// accepts commands on behalf of another local application.
pub fn start_bridge_server(state: BridgeState, port: u16) {
    tauri::async_runtime::spawn(async move {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                if let Err(error) = axum::serve(listener, router(state)).await {
                    eprintln!("[feather] Studio bridge stopped: {error}");
                }
            }
            Err(error) => {
                // Not fatal. Inspector is fully usable with no Studio attached.
                eprintln!("[feather] Studio bridge could not bind 127.0.0.1:{port}: {error}");
            }
        }
    });
}

/// Called by the Inspector webview with the legacy payload, or null when there
/// is nothing to hand over.
#[tauri::command]
pub fn resolve_studio_preferences_export(
    id: String,
    payload: Value,
    exporter: tauri::State<PreferencesExporter>,
) {
    exporter.resolve(&id, payload);
}

/// Active Studio pairings, for Inspector's settings. Tokens are never returned.
#[tauri::command]
pub fn list_studio_pairings(capabilities: tauri::State<BridgeCapabilities>) -> Vec<PairingSummary> {
    capabilities.pairings()
}

/// Revoke one Studio pairing. That Studio drops back to local editing.
#[tauri::command]
pub fn revoke_studio_pairing(pairing_id: String, capabilities: tauri::State<BridgeCapabilities>) -> bool {
    capabilities.revoke(&pairing_id)
}

/// Names and connection times from the webview's session store.
#[tauri::command]
pub fn set_studio_bridge_sessions(sessions: Vec<SessionMetaInput>, directory: tauri::State<SessionDirectory>) {
    directory.set_meta(sessions);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ws_server::{outbound_channel, SessionData};
    use tokio::sync::mpsc;

    struct Fixture {
        state: BridgeState,
        receivers: HashMap<String, mpsc::Receiver<Message>>,
    }

    impl Fixture {
        fn new(session_ids: &[&str]) -> Self {
            let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
            let state = BridgeState::new(
                sessions,
                BridgeCapabilities::default(),
                SessionDirectory::default(),
                "4.0.0".into(),
                PreferencesExporter::default(),
            );
            let mut fixture = Fixture { state, receivers: HashMap::new() };
            for id in session_ids {
                fixture.connect(id);
            }
            fixture
        }

        fn connect(&mut self, id: &str) {
            let (tx, rx) = outbound_channel();
            self.state
                .sessions
                .lock()
                .unwrap()
                .insert(id.to_string(), SessionData { sender: tx });
            self.receivers.insert(id.to_string(), rx);
        }

        fn disconnect(&mut self, id: &str) {
            self.state.sessions.lock().unwrap().remove(id);
        }

        async fn call(&self, request: Value) -> Value {
            process(&self.state, request.to_string().as_bytes()).await
        }

        async fn handshake(&self, instance: &str) -> String {
            let response = self
                .call(json!({
                    "id": "h", "bridgeVersion": 2, "method": "handshake",
                    "params": { "client": "studio", "clientVersion": "0.2.0", "clientInstanceId": instance,
                                "bridgeVersion": 2, "minSupported": 2 },
                }))
                .await;
            assert_eq!(response["ok"], true, "{response}");
            response["result"]["capability"].as_str().unwrap().to_string()
        }

        async fn method(&self, capability: &str, method: &str, params: Value) -> Value {
            self.call(json!({ "id": "r", "bridgeVersion": 2, "method": method, "capability": capability, "params": params }))
                .await
        }

        fn delivered(&mut self, id: &str) -> Vec<Value> {
            let rx = self.receivers.get_mut(id).unwrap();
            let mut out = Vec::new();
            while let Ok(Message::Text(text)) = rx.try_recv() {
                out.push(serde_json::from_str(&text).unwrap());
            }
            out
        }
    }

    fn code(response: &Value) -> &str {
        response["error"]["code"].as_str().unwrap_or("<ok>")
    }

    fn preview(session: &str, plugin: &str, action: &str) -> Value {
        json!({ "sessionId": session, "plugin": plugin, "action": action, "params": { "pixelSource": "x" } })
    }

    #[test]
    fn negotiate_accepts_an_overlapping_range() {
        assert_eq!(negotiate(2, 2), Ok(2));
        assert_eq!(negotiate(5, 1), Ok(2));
    }

    #[test]
    fn negotiate_refuses_v1_which_still_speaks_the_generic_send() {
        assert!(negotiate(1, 1).is_err());
    }

    #[test]
    fn negotiate_rejects_a_studio_that_is_too_new_to_accept_us() {
        assert!(negotiate(9, 9).is_err());
    }

    #[tokio::test]
    async fn malformed_handshakes_never_mint_a_capability() {
        let fixture = Fixture::new(&["s1"]);
        let base = json!({ "client": "studio", "clientVersion": "0.2.0", "clientInstanceId": "a",
                           "bridgeVersion": 2, "minSupported": 2 });
        let mut cases = vec![Value::Null, json!([]), json!("studio")];
        for (key, value) in [
            ("client", json!("inspector")),
            ("clientVersion", json!("")),
            ("clientVersion", json!("<script>")),
            ("clientInstanceId", Value::Null),
            ("clientInstanceId", json!("x".repeat(200))),
            ("bridgeVersion", json!("2")),
            ("minSupported", json!(1.5)),
        ] {
            let mut params = base.clone();
            params[key] = value;
            cases.push(params);
        }
        for params in cases {
            let response = fixture
                .call(json!({ "id": "h", "bridgeVersion": 2, "method": "handshake", "params": params }))
                .await;
            assert_eq!(code(&response), "malformed", "{params}");
        }
        assert!(fixture.state.capabilities.pairings().is_empty());
    }

    #[tokio::test]
    async fn oversized_and_unreadable_requests_are_refused_before_parsing() {
        let fixture = Fixture::new(&["s1"]);
        let huge = vec![b'x'; BRIDGE_MAX_REQUEST_BYTES + 1];
        assert_eq!(code(&process(&fixture.state, &huge).await), "payload-too-large");

        let handshake = json!({ "id": "h", "bridgeVersion": 2, "method": "handshake",
            "params": { "client": "studio", "clientVersion": "0.2.0", "clientInstanceId": "a",
                        "bridgeVersion": 2, "minSupported": 2, "padding": "x".repeat(5000) } });
        assert_eq!(code(&fixture.call(handshake).await), "payload-too-large");
        assert!(fixture.state.capabilities.pairings().is_empty(), "no capability minted");

        for body in ["{", "[]", "null", "42", r#"{"method":"handshake"}"#] {
            assert_eq!(code(&process(&fixture.state, body.as_bytes()).await), "malformed", "{body}");
        }
    }

    #[tokio::test]
    async fn forged_and_expired_capabilities_are_unauthenticated() {
        let fixture = Fixture::new(&["s1"]);
        assert_eq!(code(&fixture.method("studio-forged", "sessions.list", json!({})).await), "unauthenticated");

        let cap = fixture.handshake("a").await;
        assert_eq!(fixture.method(&cap, "sessions.list", json!({})).await["ok"], true);
        fixture.state.capabilities.expire_all();
        assert_eq!(code(&fixture.method(&cap, "sessions.list", json!({})).await), "unauthenticated");
        assert!(fixture.state.capabilities.pairings().is_empty(), "an expired pairing is not listed");
    }

    #[tokio::test]
    async fn a_capability_cannot_reach_eval_debugger_console_hot_reload_packages_or_replay() {
        let mut fixture = Fixture::new(&["s1"]);
        let cap = fixture.handshake("a").await;
        assert_eq!(fixture.method(&cap, "sessions.select", json!({ "sessionId": "s1" })).await["ok"], true);

        for method in ["session.send", "session.describe", "send", "eval", "console.eval"] {
            let response = fixture
                .method(&cap, method, json!({ "sessionId": "s1", "message": { "type": "cmd:eval", "code": "os.exit()" } }))
                .await;
            assert_eq!(code(&response), "unknown-method", "{method}");
        }

        for (plugin, action) in [
            ("console", "eval"),
            ("debugger", "continue"),
            ("hot-reload", "reload"),
            ("session-replay", "play"),
            ("packages", "install"),
            ("filesystem", "write"),
            ("shader-graph", "eval"),
            ("particle-system-playground", "export-zip"),
        ] {
            let response = fixture.method(&cap, "preview.send", preview("s1", plugin, action)).await;
            assert_eq!(code(&response), "forbidden", "{plugin}:{action}");
        }
        assert!(fixture.delivered("s1").is_empty(), "nothing outside the allowlist reached the game");
    }

    #[tokio::test]
    async fn a_preview_becomes_one_allowlisted_command_with_a_fresh_request_id() {
        let mut fixture = Fixture::new(&["s1"]);
        let cap = fixture.handshake("a").await;
        fixture.method(&cap, "sessions.select", json!({ "sessionId": "s1" })).await;

        let mut params = preview("s1", "shader-graph", "preview-shader");
        params["params"]["type"] = json!("cmd:eval");
        let sent = fixture.method(&cap, "preview.send", params).await;
        let cancelled = fixture
            .method(&cap, "preview.cancel", json!({ "sessionId": "s1", "plugin": "shader-graph", "action": "preview-shader" }))
            .await;
        assert_eq!(sent["ok"], true, "{sent}");
        assert_eq!(cancelled["ok"], true, "{cancelled}");

        let delivered = fixture.delivered("s1");
        assert_eq!(delivered.len(), 2);
        assert_eq!(delivered[0]["type"], "cmd:plugin:action");
        assert_eq!(delivered[0]["plugin"], "shader-graph");
        assert_eq!(delivered[0]["action"], "preview-shader");
        assert_eq!(delivered[0]["params"]["type"], "cmd:eval", "a type inside params stays inside params");
        assert_eq!(delivered[0]["requestId"], sent["result"]["requestId"]);
        assert_eq!(delivered[1]["type"], "cmd:plugin:action:cancel");
        assert_ne!(delivered[0]["requestId"], delivered[1]["requestId"]);
    }

    #[tokio::test]
    async fn malformed_preview_parameters_are_rejected_before_forwarding() {
        let mut fixture = Fixture::new(&["s1"]);
        let cap = fixture.handshake("a").await;
        fixture.method(&cap, "sessions.select", json!({ "sessionId": "s1" })).await;
        for params in [
            json!({}),
            json!({ "plugin": "shader-graph", "action": "preview-shader", "params": {} }),
            json!({ "sessionId": "s1", "action": "preview-shader", "params": {} }),
            json!({ "sessionId": "s1", "plugin": "shader-graph", "params": {} }),
            json!({ "sessionId": "s1", "plugin": "shader-graph", "action": "preview-shader", "params": "text" }),
            json!({ "sessionId": "s1", "plugin": "x".repeat(65), "action": "preview-shader", "params": {} }),
        ] {
            assert_eq!(code(&fixture.method(&cap, "preview.send", params.clone()).await), "malformed", "{params}");
        }
        assert!(fixture.delivered("s1").is_empty());
    }

    #[tokio::test]
    async fn sessions_are_listed_in_a_stable_order_with_names_from_inspector() {
        let fixture = Fixture::new(&["zeta", "beta", "alpha"]);
        fixture.state.directory.set_meta(vec![
            SessionMetaInput { id: "zeta".into(), name: Some("Late".into()), connected_at: Some(3_000) },
            SessionMetaInput { id: "beta".into(), name: Some("Tie B".into()), connected_at: Some(1_000) },
            SessionMetaInput { id: "alpha".into(), name: Some("  ".into()), connected_at: Some(1_000) },
        ]);
        let cap = fixture.handshake("a").await;
        let listed = fixture.method(&cap, "sessions.list", json!({})).await;
        let ids: Vec<&str> = listed["result"]["sessions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, vec!["alpha", "beta", "zeta"]);
        assert_eq!(listed["result"]["sessions"][0]["name"], Value::Null, "a blank name is no name");
        assert_eq!(listed["result"]["sessions"][2]["name"], "Late");
        assert_eq!(listed["result"]["selectedSessionId"], Value::Null);
    }

    #[tokio::test]
    async fn several_games_and_no_selection_ask_for_one_instead_of_guessing() {
        let mut fixture = Fixture::new(&["s1", "s2"]);
        let cap = fixture.handshake("a").await;
        let response = fixture.method(&cap, "preview.send", preview("s1", "shader-graph", "preview-shader")).await;
        assert_eq!(code(&response), "selection-required");
        assert!(fixture.delivered("s1").is_empty());
        assert!(fixture.delivered("s2").is_empty());

        let none = Fixture::new(&[]);
        let cap = none.handshake("a").await;
        let response = none.method(&cap, "preview.send", preview("s1", "shader-graph", "preview-shader")).await;
        assert_eq!(code(&response), "no-session");
    }

    #[tokio::test]
    async fn stale_and_out_of_scope_sessions_are_rejected() {
        let mut fixture = Fixture::new(&["s1", "s2"]);
        let cap = fixture.handshake("a").await;
        assert_eq!(code(&fixture.method(&cap, "sessions.select", json!({ "sessionId": "ghost" })).await), "stale-session");

        fixture.method(&cap, "sessions.select", json!({ "sessionId": "s1" })).await;
        let other = fixture.method(&cap, "preview.send", preview("s2", "shader-graph", "preview-shader")).await;
        assert_eq!(code(&other), "forbidden", "a pairing previews only into its own session");

        // The game restarts: its old session is gone and a new id appears.
        fixture.disconnect("s1");
        fixture.connect("s1-restarted");
        let stale = fixture.method(&cap, "preview.send", preview("s1", "shader-graph", "preview-shader")).await;
        assert_eq!(code(&stale), "stale-session");
        let listed = fixture.method(&cap, "sessions.list", json!({})).await;
        assert_eq!(listed["result"]["selectedSessionId"], Value::Null);
        assert!(fixture.delivered("s2").is_empty());
        assert!(fixture.delivered("s1-restarted").is_empty(), "never silently retargeted");
    }

    #[tokio::test]
    async fn revoking_one_pairing_leaves_the_others_working() {
        let fixture = Fixture::new(&["s1"]);
        let first = fixture.handshake("studio-a").await;
        let second = fixture.handshake("studio-b").await;
        let pairings = fixture.state.capabilities.pairings();
        assert_eq!(pairings.len(), 2);
        let serialized = serde_json::to_string(&pairings).unwrap();
        assert!(!serialized.contains(&first) && !serialized.contains(&second), "tokens are never listed");

        let target = pairings.iter().find(|p| p.client_instance_id == "studio-a").unwrap();
        assert!(fixture.state.capabilities.revoke(&target.pairing_id));
        assert_eq!(code(&fixture.method(&first, "sessions.list", json!({})).await), "unauthenticated");
        assert_eq!(fixture.method(&second, "sessions.list", json!({})).await["ok"], true);
    }

    #[tokio::test]
    async fn a_rehandshake_replaces_the_instance_capability_and_release_ends_it() {
        let fixture = Fixture::new(&["s1"]);
        let old = fixture.handshake("studio-a").await;
        let new = fixture.handshake("studio-a").await;
        assert_eq!(fixture.state.capabilities.pairings().len(), 1);
        assert_eq!(code(&fixture.method(&old, "sessions.list", json!({})).await), "unauthenticated");

        assert_eq!(fixture.method(&new, "capability.release", json!({})).await["ok"], true);
        assert!(fixture.state.capabilities.pairings().is_empty());
    }

    #[test]
    fn revoke_all_invalidates_outstanding_capabilities() {
        let caps = BridgeCapabilities::default();
        let (token, _) = caps.issue("a", "0.2.0", 2);
        assert!(caps.authorize(&token).is_some());
        caps.revoke_all();
        assert!(caps.authorize(&token).is_none(), "a revoked capability must stop working");
    }

    #[tokio::test]
    async fn over_http_an_oversized_body_is_refused_and_a_handshake_succeeds() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let fixture = Fixture::new(&["s1"]);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = router(fixture.state.clone());
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        async fn request(addr: SocketAddr, method: &str, headers: &str, body: &[u8]) -> String {
            let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
            let head = format!(
                "{method} /bridge HTTP/1.1\r\nHost: 127.0.0.1\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(head.as_bytes()).await.unwrap();
            // A server that refuses early may close before the whole body is written.
            let _ = stream.write_all(body).await;
            let mut response = String::new();
            let _ = stream.read_to_string(&mut response).await;
            response
        }

        let handshake = json!({ "id": "h", "bridgeVersion": 2, "method": "handshake",
            "params": { "client": "studio", "clientVersion": "0.2.0", "clientInstanceId": "a",
                        "bridgeVersion": 2, "minSupported": 2 } })
        .to_string();
        const JSON: &str = "Content-Type: application/json\r\n";
        let accepted = request(addr, "POST", JSON, handshake.as_bytes()).await;
        assert!(accepted.starts_with("HTTP/1.1 200"), "{accepted}");
        assert!(accepted.contains("\"capability\""));

        let refused = request(addr, "POST", JSON, &vec![b' '; BRIDGE_MAX_REQUEST_BYTES + 1]).await;
        assert!(refused.starts_with("HTTP/1.1 413"), "{}", refused.lines().next().unwrap_or(""));

        // Studio's webview may pair; any other web page may not, and a
        // text/plain "simple request" that would skip the preflight is refused.
        let studio = format!("{JSON}Origin: tauri://localhost\r\n");
        let from_studio = request(addr, "POST", &studio, handshake.as_bytes()).await;
        assert!(from_studio.starts_with("HTTP/1.1 200"), "{from_studio}");
        assert!(from_studio.to_lowercase().contains("access-control-allow-origin: tauri://localhost"));

        let evil = format!("{JSON}Origin: https://evil.example\r\n");
        let from_evil = request(addr, "POST", &evil, handshake.as_bytes()).await;
        assert!(from_evil.starts_with("HTTP/1.1 403"), "{from_evil}");
        let preflight_evil = request(addr, "OPTIONS", "Origin: https://evil.example\r\n", b"").await;
        assert!(preflight_evil.starts_with("HTTP/1.1 403"), "{preflight_evil}");
        let preflight_studio = request(addr, "OPTIONS", "Origin: http://localhost:1430\r\n", b"").await;
        assert!(preflight_studio.starts_with("HTTP/1.1 204"), "{preflight_studio}");

        let plain = request(addr, "POST", "Content-Type: text/plain\r\n", handshake.as_bytes()).await;
        assert!(plain.starts_with("HTTP/1.1 415"), "{plain}");
        // The same instance id re-handshook twice, so one pairing remains.
        assert_eq!(fixture.state.capabilities.pairings().len(), 1);
    }
}
