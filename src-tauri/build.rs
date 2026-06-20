fn main() {
    ensure_cli_sidecar_placeholder();
    tauri_build::build()
}

fn ensure_cli_sidecar_placeholder() {
    let target = match std::env::var("TARGET") {
        Ok(target) => target,
        Err(_) => return,
    };
    let extension = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let path = std::path::Path::new("binaries").join(format!("feather-cli-{target}{extension}"));
    if path.exists() {
        return;
    }
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let body = if target.contains("windows") {
        "@echo off\r\necho Feather CLI sidecar was not prepared.\r\nexit /b 127\r\n"
    } else {
        "#!/bin/sh\necho 'Feather CLI sidecar was not prepared.' >&2\nexit 127\n"
    };
    let _ = std::fs::write(&path, body);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&path) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o755);
            let _ = std::fs::set_permissions(&path, permissions);
        }
    }
}
