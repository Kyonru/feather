mod ws_server;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use ws_server::Sessions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Shared session map between the WS server and the Tauri send_command handler
    let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(sessions.clone())
        .setup(move |app| {
            let handle = app.handle().clone();
            let port: u16 = std::env::var("FEATHER_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(4004);
            ws_server::start(handle, port, sessions.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ws_server::send_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
