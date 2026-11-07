//! Feather Studio's native shell.
//!
//! Intentionally thin. Studio is a local editor: its Rust side exists to host a
//! webview and provide file dialogs. It runs no WebSocket server and spawns no
//! CLI, because Inspector owns live game sessions. Reaching a game happens over
//! the authenticated bridge described in `@feather/session-bridge`, from the
//! frontend, not from here.

mod creative_mcp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let creative = creative_mcp::CreativeMcpState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(creative.clone())
        .setup(move |app| {
            creative.set_app_handle(app.handle().clone());

            // There is one Feather MCP server, in the CLI. It routes session
            // traffic to Inspector and creative traffic here, so an agent
            // configures one thing while the state stays with whichever
            // application owns it.
            let port: u16 = std::env::var("FEATHER_STUDIO_MCP_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(4007);
            creative_mcp::start(creative.clone(), port);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            creative_mcp::set_mcp_creative_snapshot,
            creative_mcp::resolve_mcp_creative_request,
            creative_mcp::get_studio_mcp_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Feather Studio");
}
