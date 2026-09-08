//! The Inspector side of the Feather Studio bridge.
//!
//! Feather Studio is a separate installed application. It edits shaders,
//! textures and particles locally and does not own game sessions — Inspector
//! does. When Studio wants to push work into a running game it asks here.
//!
//! Three properties this endpoint has to hold, because a request that reaches
//! this far can execute inside someone's game:
//!
//! * **Loopback only.** Bound to 127.0.0.1, never a wildcard, so the bridge is
//!   not reachable from the network the way the game WebSocket deliberately is.
//! * **Capability gated.** Everything except the handshake requires a
//!   short-lived token this process issued. Tokens live in memory only and die
//!   with the process.
//! * **Version negotiated first.** An incompatible Studio is refused at the
//!   handshake, before it can name a method — the two applications release on
//!   separate trains, so version skew is expected rather than exceptional.
//!
//! The contract mirrored here is `packages/session-bridge/src/contract.ts`.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use axum::extract::ws::Message;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use crate::ws_server::Sessions;

/// Keep in step with `BRIDGE_VERSION` in the TypeScript contract.
pub const BRIDGE_VERSION: u32 = 1;
pub const BRIDGE_MIN_SUPPORTED: u32 = 1;

/// Short enough that a leaked token is not a standing key to someone's game.
const CAPABILITY_TTL: Duration = Duration::from_secs(60 * 30);

#[derive(Clone, Default)]
pub struct BridgeCapabilities {
    /// token -> expiry (unix millis)
    issued: Arc<Mutex<HashMap<String, u128>>>,
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

impl BridgeCapabilities {
    fn issue(&self) -> (String, u128) {
        let token = format!("studio-{}", uuid::Uuid::new_v4());
        let expires = now_millis() + CAPABILITY_TTL.as_millis();
        let mut issued = self.issued.lock().unwrap_or_else(|e| e.into_inner());
        // Drop anything already expired rather than letting the map grow.
        issued.retain(|_, exp| *exp > now_millis());
        issued.insert(token.clone(), expires);
        (token, expires)
    }

    fn verify(&self, token: &str) -> bool {
        let mut issued = self.issued.lock().unwrap_or_else(|e| e.into_inner());
        match issued.get(token) {
            Some(expires) if *expires > now_millis() => true,
            Some(_) => {
                issued.remove(token);
                false
            }
            None => false,
        }
    }

    /// Invalidate every outstanding capability. Used when the user turns the
    /// bridge off; an in-flight Studio must re-handshake.
    pub fn revoke_all(&self) {
        self.issued
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
    }
}

#[derive(Clone)]
struct BridgeState {
    sessions: Sessions,
    capabilities: BridgeCapabilities,
    server_version: String,
    /// Needed for `preferences.export`: the payload lives in the Inspector
    /// webview's local storage, which this process cannot read directly.
    exporter: PreferencesExporter,
}

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

#[derive(Deserialize)]
struct BridgeRequest {
    id: String,
    #[serde(rename = "bridgeVersion", default)]
    bridge_version: u32,
    method: String,
    #[serde(default)]
    capability: Option<String>,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct BridgeErrorBody {
    code: String,
    message: String,
}

fn ok(id: &str, result: Value) -> Json<Value> {
    Json(json!({ "id": id, "bridgeVersion": BRIDGE_VERSION, "ok": true, "result": result }))
}

fn fail(id: &str, code: &str, message: &str) -> Json<Value> {
    Json(json!({
        "id": id,
        "bridgeVersion": BRIDGE_VERSION,
        "ok": false,
        "error": BridgeErrorBody { code: code.into(), message: message.into() },
    }))
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

async fn handle(State(state): State<BridgeState>, Json(request): Json<BridgeRequest>) -> Json<Value> {
    let id = request.id.clone();

    if request.method == "handshake" {
        let remote_version = request
            .params
            .get("bridgeVersion")
            .and_then(Value::as_u64)
            .unwrap_or(request.bridge_version as u64) as u32;
        let remote_min = request
            .params
            .get("minSupported")
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32;

        return match negotiate(remote_version, remote_min) {
            Err(message) => fail(&id, "incompatible-version", &message),
            Ok(version) => {
                let (capability, expires_at) = state.capabilities.issue();
                ok(
                    &id,
                    json!({
                        "server": "inspector",
                        "serverVersion": state.server_version,
                        "bridgeVersion": version,
                        "capability": capability,
                        "expiresAt": expires_at as u64,
                    }),
                )
            }
        };
    }

    let authorized = request
        .capability
        .as_deref()
        .map(|token| state.capabilities.verify(token))
        .unwrap_or(false);

    if !authorized {
        return fail(
            &id,
            "unauthenticated",
            "Missing or expired Inspector capability. Reconnect.",
        );
    }

    match request.method.as_str() {
        "session.describe" => {
            let sessions = match state.sessions.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            let first = sessions.keys().next().cloned();
            ok(
                &id,
                json!({
                    "sessionId": first,
                    "name": null,
                    "connected": !sessions.is_empty(),
                }),
            )
        }

        "session.send" => {
            let session_id = request.params.get("sessionId").and_then(Value::as_str);
            let message = match request.params.get("message") {
                Some(Value::String(text)) => text.clone(),
                Some(value) => value.to_string(),
                None => return fail(&id, "rejected", "The command had no message."),
            };

            let Some(session_id) = session_id else {
                return fail(&id, "no-session", "Feather Inspector has no game attached.");
            };

            let sessions = match state.sessions.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            let Some(session) = sessions.get(session_id) else {
                return fail(&id, "no-session", "Feather Inspector has no game attached.");
            };

            match session.sender.send(Message::Text(message.into())) {
                Ok(()) => ok(&id, Value::Null),
                Err(error) => fail(&id, "rejected", &error.to_string()),
            }
        }

        // Answered by the Inspector webview, which holds the legacy payload.
        // Null means "nothing to hand over", which is the normal case for a
        // fresh install and is not an error.
        "preferences.export" => match state.exporter.export().await {
            Some(payload) => ok(&id, payload),
            None => ok(&id, Value::Null),
        },

        other => fail(&id, "unknown-method", &format!("Unrecognized bridge method \"{other}\".")),
    }
}

/// Start the loopback bridge listener.
///
/// Bound to 127.0.0.1 on purpose. The game WebSocket binds 0.0.0.0 because
/// devices on the LAN legitimately connect to it; this one must not, because it
/// accepts commands on behalf of another local application.
pub fn start_bridge_server(
    sessions: Sessions,
    port: u16,
    server_version: String,
    exporter: PreferencesExporter,
) -> BridgeCapabilities {
    let capabilities = BridgeCapabilities::default();
    let state = BridgeState {
        sessions,
        capabilities: capabilities.clone(),
        server_version,
        exporter,
    };

    tauri::async_runtime::spawn(async move {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                let app = Router::new().route("/bridge", post(handle)).with_state(state);
                if let Err(error) = axum::serve(listener, app).await {
                    eprintln!("[feather] Studio bridge stopped: {error}");
                }
            }
            Err(error) => {
                // Not fatal. Inspector is fully usable with no Studio attached.
                eprintln!("[feather] Studio bridge could not bind 127.0.0.1:{port}: {error}");
            }
        }
    });

    capabilities
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn negotiate_accepts_an_overlapping_range() {
        assert_eq!(negotiate(1, 1), Ok(1));
    }

    #[test]
    fn negotiate_rejects_a_studio_that_is_too_new_to_accept_us() {
        assert!(negotiate(9, 9).is_err());
    }

    #[test]
    fn capabilities_verify_only_what_they_issued() {
        let caps = BridgeCapabilities::default();
        let (token, _) = caps.issue();
        assert!(caps.verify(&token));
        assert!(!caps.verify("studio-forged"));
    }

    #[test]
    fn revoking_invalidates_outstanding_capabilities() {
        let caps = BridgeCapabilities::default();
        let (token, _) = caps.issue();
        assert!(caps.verify(&token));
        caps.revoke_all();
        assert!(!caps.verify(&token), "a revoked capability must stop working");
    }
}
