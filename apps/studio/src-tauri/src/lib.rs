//! Feather Studio's native shell.
//!
//! Intentionally thin. Studio is a local editor: its Rust side exists to host a
//! webview and provide file dialogs. It runs no WebSocket server and spawns no
//! CLI, because Inspector owns live game sessions. Reaching a game happens over
//! the authenticated bridge described in `@feather/session-bridge`, from the
//! frontend, not from here.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Feather Studio");
}
