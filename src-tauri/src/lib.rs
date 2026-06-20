mod cli_status;
mod mcp_bridge;
mod ws_server;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use ws_server::{AppId, Sessions};

#[derive(serde::Serialize)]
struct LocalIp {
    ip: String,
    name: String,
}

#[tauri::command]
fn get_local_ips() -> Vec<LocalIp> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|iface| {
            // Only non-loopback IPv4 addresses
            if iface.is_loopback() {
                return false;
            }
            if !iface.ip().is_ipv4() {
                return false;
            }
            // Filter out Docker/VM interfaces
            let name = &iface.name;
            !name.starts_with("veth")
                && !name.starts_with("docker")
                && !name.starts_with("br-")
                && !name.starts_with("virbr")
        })
        .map(|iface| LocalIp {
            ip: iface.ip().to_string(),
            name: iface.name,
        })
        .collect()
}

#[tauri::command]
async fn get_cli_status(cli_path: Option<String>) -> Result<cli_status::CliStatus, String> {
    tauri::async_runtime::spawn_blocking(move || cli_status::status(cli_path))
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn get_cli_project_status(
    project_dir: String,
    cli_path: Option<String>,
) -> Result<cli_status::CliProjectStatus, String> {
    tauri::async_runtime::spawn_blocking(move || cli_status::project_status(project_dir, cli_path))
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn open_source_location(
    editor_path: String,
    project_root: String,
    relative_file: String,
    line: Option<u32>,
) -> Result<(), String> {
    cli_status::open_source_location(editor_path, project_root, relative_file, line)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Shared session map and app ID between the WS server and Tauri commands
    let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
    let app_id: AppId = Arc::new(Mutex::new(String::new()));
    let mcp_bridge = mcp_bridge::new_state(sessions.clone(), app_id.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(sessions.clone())
        .manage(app_id.clone())
        .manage(mcp_bridge.clone())
        .setup(move |app| {
            let handle = app.handle().clone();
            let port: u16 = std::env::var("FEATHER_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(4004);
            let mcp_port: u16 = std::env::var("FEATHER_MCP_BRIDGE_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(4005);
            ws_server::start(handle, port, sessions.clone(), app_id.clone(), mcp_bridge.clone());
            mcp_bridge::start(mcp_bridge.clone(), mcp_port);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ws_server::send_command,
            ws_server::get_active_sessions,
            ws_server::close_session,
            ws_server::set_app_id,
            mcp_bridge::get_mcp_bridge_settings,
            mcp_bridge::set_mcp_bridge_enabled,
            mcp_bridge::regenerate_mcp_bridge_token,
            mcp_bridge::set_mcp_api_keys,
            get_local_ips,
            get_cli_status,
            get_cli_project_status,
            open_source_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
