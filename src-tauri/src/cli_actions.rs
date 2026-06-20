use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct CliActionState {
    jobs: Arc<Mutex<HashMap<String, CliJob>>>,
}

#[derive(Clone)]
struct CliJob {
    snapshot: Arc<Mutex<CliJobSnapshot>>,
    child: Arc<Mutex<Option<std::process::Child>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliActionRequest {
    pub kind: CliActionKind,
    pub project_dir: Option<String>,
    pub cli_path: Option<String>,
    pub options: Option<Value>,
    pub dry_run: Option<bool>,
    pub confirmed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CliActionKind {
    Doctor,
    BuildVendorList,
    BuildVendorAdd,
    SkillsList,
    SkillsInstall,
    PackageList,
    PackageInstall,
    PackageRemove,
    PackageAudit,
    PluginList,
    PluginInstall,
    Init,
    ConfigPlugins,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliJobSnapshot {
    pub id: String,
    pub kind: CliActionKind,
    pub status: CliJobStatus,
    pub command_preview: String,
    pub project_dir: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub exit_code: Option<i32>,
    pub stdout_tail: String,
    pub stderr_tail: String,
    pub json: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CliJobStatus {
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[tauri::command]
pub fn start_cli_job(
    app: AppHandle,
    state: tauri::State<CliActionState>,
    request: CliActionRequest,
) -> Result<CliJobSnapshot, String> {
    let executable =
        crate::cli_status::resolve_cli_path(request.cli_path.clone()).ok_or_else(|| {
            "Feather CLI was not found. Configure a CLI path or install @kyonru/feather."
                .to_string()
        })?;
    let argv = action_args(&request)?;
    let command_preview = redact_text(&format!("{} {}", executable, argv.join(" ")));
    let id = format!("cli-job-{}", Uuid::new_v4());
    let snapshot = Arc::new(Mutex::new(CliJobSnapshot {
        id: id.clone(),
        kind: request.kind.clone(),
        status: CliJobStatus::Running,
        command_preview,
        project_dir: request.project_dir.clone(),
        started_at: now_iso(),
        ended_at: None,
        exit_code: None,
        stdout_tail: String::new(),
        stderr_tail: String::new(),
        json: None,
        error: None,
    }));

    let mut command = Command::new(&executable);
    command
        .args(&argv)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|err| format!("Failed to start Feather CLI: {err}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child_ref = Arc::new(Mutex::new(Some(child)));
    let job = CliJob {
        snapshot: snapshot.clone(),
        child: child_ref.clone(),
    };
    state
        .jobs
        .lock()
        .map_err(|err| err.to_string())?
        .insert(id.clone(), job);
    emit_job(&app, &snapshot);

    if let Some(stdout) = stdout {
        spawn_reader(app.clone(), snapshot.clone(), stdout, true);
    }
    if let Some(stderr) = stderr {
        spawn_reader(app.clone(), snapshot.clone(), stderr, false);
    }

    let wait_snapshot = snapshot.clone();
    let wait_child_ref = child_ref.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(100));
        let status = {
            let mut guard = match wait_child_ref.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            match guard.as_mut() {
                Some(child) => child.try_wait(),
                None => return,
            }
        };

        match status {
            Ok(Some(status)) => {
                if let Ok(mut guard) = wait_child_ref.lock() {
                    *guard = None;
                }
                if let Ok(mut snap) = wait_snapshot.lock() {
                    let stdout = snap.stdout_tail.clone();
                    snap.exit_code = status.code();
                    snap.ended_at = Some(now_iso());
                    if status.success() {
                        snap.status = CliJobStatus::Succeeded;
                    } else if snap.status != CliJobStatus::Cancelled {
                        snap.status = CliJobStatus::Failed;
                        snap.error = Some(format!(
                            "Feather CLI exited with {}",
                            status.code().unwrap_or(-1)
                        ));
                    }
                    snap.json = parse_json_payload(&stdout).map(redact_value);
                }
                emit_job(&app, &wait_snapshot);
                return;
            }
            Ok(None) => continue,
            Err(err) => {
                if let Ok(mut snap) = wait_snapshot.lock() {
                    snap.status = CliJobStatus::Failed;
                    snap.ended_at = Some(now_iso());
                    snap.error = Some(err.to_string());
                }
                emit_job(&app, &wait_snapshot);
                return;
            }
        }
    });

    snapshot
        .lock()
        .map(|snap| snap.clone())
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_cli_job(
    state: tauri::State<CliActionState>,
    job_id: String,
) -> Result<CliJobSnapshot, String> {
    let jobs = state.jobs.lock().map_err(|err| err.to_string())?;
    let job = jobs
        .get(&job_id)
        .ok_or_else(|| format!("Unknown CLI job: {job_id}"))?;
    job.snapshot
        .lock()
        .map(|snap| snap.clone())
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn cancel_cli_job(
    app: AppHandle,
    state: tauri::State<CliActionState>,
    job_id: String,
) -> Result<CliJobSnapshot, String> {
    let jobs = state.jobs.lock().map_err(|err| err.to_string())?;
    let job = jobs
        .get(&job_id)
        .ok_or_else(|| format!("Unknown CLI job: {job_id}"))?;
    if let Ok(mut child_guard) = job.child.lock() {
        if let Some(child) = child_guard.as_mut() {
            let _ = child.kill();
        }
        *child_guard = None;
    }
    if let Ok(mut snap) = job.snapshot.lock() {
        snap.status = CliJobStatus::Cancelled;
        snap.ended_at = Some(now_iso());
        snap.error = Some("CLI job cancelled.".to_string());
    }
    emit_job(&app, &job.snapshot);
    job.snapshot
        .lock()
        .map(|snap| snap.clone())
        .map_err(|err| err.to_string())
}

fn spawn_reader<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    snapshot: Arc<Mutex<CliJobSnapshot>>,
    reader: R,
    stdout: bool,
) {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines().map_while(Result::ok) {
            if let Ok(mut snap) = snapshot.lock() {
                if stdout {
                    push_tail(&mut snap.stdout_tail, &line);
                } else {
                    push_tail(&mut snap.stderr_tail, &line);
                }
            }
            emit_job(&app, &snapshot);
        }
    });
}

fn emit_job(app: &AppHandle, snapshot: &Arc<Mutex<CliJobSnapshot>>) {
    if let Ok(snap) = snapshot.lock() {
        let _ = app.emit("feather://cli-job", snap.clone());
    }
}

fn action_args(request: &CliActionRequest) -> Result<Vec<String>, String> {
    let options = request.options.as_ref();
    let project_dir = request.project_dir.clone();
    let dry_run = request.dry_run == Some(true);
    let mut args = Vec::<String>::new();

    match request.kind {
        CliActionKind::Doctor => {
            args.push("doctor".into());
            if let Some(dir) = project_dir {
                args.push(dir);
            }
            args.push("--json".into());
            if bool_opt(options, "production") {
                args.push("--production".into());
            }
            if bool_opt(options, "security") {
                args.push("--security".into());
            }
            if bool_opt(options, "release") {
                args.push("--release".into());
            }
            if let Some(target) = string_opt(options, "buildTarget") {
                args.extend(["--build-target".into(), target]);
            }
        }
        CliActionKind::BuildVendorList => {
            args.extend(["build".into(), "vendor".into(), "list".into()]);
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
        }
        CliActionKind::BuildVendorAdd => {
            ensure_confirmed(request)?;
            args.extend(["build".into(), "vendor".into(), "add".into()]);
            let targets = string_array_opt(options, "targets");
            if targets.is_empty() {
                return Err("buildVendorAdd requires options.targets.".into());
            }
            args.extend(targets);
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
            if dry_run {
                args.push("--dry-run".into());
            }
            if bool_opt(options, "force") {
                args.push("--force".into());
            }
        }
        CliActionKind::SkillsList => {
            args.extend(["skills".into(), "list".into(), "--json".into()]);
        }
        CliActionKind::SkillsInstall => {
            ensure_confirmed(request)?;
            args.extend(["skills".into(), "install".into()]);
            if bool_opt(options, "all") {
                args.push("--all".into());
            } else {
                let ids = string_array_opt(options, "ids");
                if ids.is_empty() {
                    return Err("skillsInstall requires options.ids or options.all.".into());
                }
                args.extend(ids);
            }
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
            if dry_run {
                args.push("--dry-run".into());
            }
            if bool_opt(options, "force") {
                args.push("--force".into());
            }
        }
        CliActionKind::PackageList => {
            args.extend(["package".into(), "list".into()]);
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
            if bool_opt(options, "installed") {
                args.push("--installed".into());
            }
            if bool_opt(options, "offline") {
                args.push("--offline".into());
            }
        }
        CliActionKind::PackageInstall => {
            ensure_confirmed(request)?;
            args.extend(["package".into(), "install".into()]);
            let names = string_array_opt(options, "names");
            if names.is_empty() {
                return Err("packageInstall requires options.names.".into());
            }
            args.extend(names);
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
            if dry_run {
                args.push("--dry-run".into());
            }
            if bool_opt(options, "allowUntrusted") {
                args.push("--allow-untrusted".into());
            }
            if bool_opt(options, "allowNonLuaFiles") {
                args.push("--allow-non-lua-files".into());
            }
            if bool_opt(options, "offline") {
                args.push("--offline".into());
            }
        }
        CliActionKind::PackageRemove => {
            ensure_confirmed(request)?;
            args.extend(["package".into(), "remove".into()]);
            let name = string_opt(options, "name").ok_or("packageRemove requires options.name.")?;
            args.push(name);
            push_dir(&mut args, project_dir)?;
            args.push("--yes".into());
            args.push("--json".into());
        }
        CliActionKind::PackageAudit => {
            args.extend(["package".into(), "audit".into()]);
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
        }
        CliActionKind::PluginList => {
            args.extend(["plugin".into(), "list".into()]);
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
            if let Some(managed) = string_opt(options, "managed") {
                args.extend(["--managed".into(), managed]);
            }
        }
        CliActionKind::PluginInstall => {
            ensure_confirmed(request)?;
            args.extend(["plugin".into(), "install".into()]);
            let ids = string_array_opt(options, "ids");
            if ids.is_empty() {
                return Err("pluginInstall requires options.ids.".into());
            }
            args.extend(ids);
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
            if dry_run {
                args.push("--dry-run".into());
            }
            if bool_opt(options, "force") {
                args.push("--force".into());
            }
            if let Some(managed) = string_opt(options, "managed") {
                args.extend(["--managed".into(), managed]);
            }
        }
        CliActionKind::Init => {
            ensure_confirmed(request)?;
            args.push("init".into());
            args.push(project_dir.ok_or("init requires projectDir.")?);
            args.extend([
                "--mode".into(),
                string_opt(options, "mode").unwrap_or_else(|| "cli".into()),
            ]);
            args.push("--yes".into());
            args.push("--json".into());
            if bool_opt(options, "noPlugins") {
                args.push("--no-plugins".into());
            }
            if let Some(plugins) = string_array_nonempty(options, "plugins") {
                args.extend(["--plugins".into(), plugins.join(",")]);
            }
        }
        CliActionKind::ConfigPlugins => {
            ensure_confirmed(request)?;
            args.extend(["config".into(), "plugins".into()]);
            push_dir(&mut args, project_dir)?;
            args.push("--json".into());
            if dry_run {
                args.push("--dry-run".into());
            }
            if let Some(include) = string_array_nonempty(options, "include") {
                args.extend(["--include".into(), include.join(",")]);
            }
            if let Some(exclude) = string_array_nonempty(options, "exclude") {
                args.extend(["--exclude".into(), exclude.join(",")]);
            }
        }
    }
    Ok(args)
}

fn ensure_confirmed(request: &CliActionRequest) -> Result<(), String> {
    if request.dry_run == Some(true) || request.confirmed == Some(true) {
        Ok(())
    } else {
        Err(format!(
            "{:?} requires dryRun or confirmed=true.",
            request.kind
        ))
    }
}

fn push_dir(args: &mut Vec<String>, project_dir: Option<String>) -> Result<(), String> {
    let dir = project_dir.ok_or("This CLI action requires projectDir.")?;
    args.extend(["--dir".into(), dir]);
    Ok(())
}

fn bool_opt(options: Option<&Value>, key: &str) -> bool {
    options
        .and_then(|value| value.get(key))
        .and_then(Value::as_bool)
        == Some(true)
}

fn string_opt(options: Option<&Value>, key: &str) -> Option<String> {
    options
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn string_array_opt(options: Option<&Value>, key: &str) -> Vec<String> {
    options
        .and_then(|value| value.get(key))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn string_array_nonempty(options: Option<&Value>, key: &str) -> Option<Vec<String>> {
    let values = string_array_opt(options, key);
    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

fn push_tail(target: &mut String, line: &str) {
    if !target.is_empty() {
        target.push('\n');
    }
    target.push_str(&redact_text(line));
    const MAX_TAIL_BYTES: usize = 12 * 1024;
    if target.len() > MAX_TAIL_BYTES {
        let keep_from = target.len() - MAX_TAIL_BYTES;
        let boundary = target
            .char_indices()
            .find_map(|(index, _)| (index >= keep_from).then_some(index))
            .unwrap_or(target.len());
        *target = target[boundary..].to_string();
    }
}

fn parse_json_payload(text: &str) -> Option<Value> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str::<Value>(trimmed).ok().or_else(|| {
        let start_object = trimmed.find('{');
        let start_array = trimmed.find('[');
        let start = match (start_object, start_array) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        }?;
        let end = trimmed.rfind('}').or_else(|| trimmed.rfind(']'))?;
        serde_json::from_str::<Value>(&trimmed[start..=end]).ok()
    })
}

fn redact_value(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, value)| {
                    let lower = key.to_ascii_lowercase();
                    if lower.contains("token")
                        || lower.contains("secret")
                        || lower.contains("apikey")
                        || lower == "appid"
                    {
                        (key, Value::String("[REDACTED]".into()))
                    } else {
                        (key, redact_value(value))
                    }
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(redact_value).collect()),
        Value::String(text) => Value::String(redact_text(&text)),
        other => other,
    }
}

fn redact_text(input: &str) -> String {
    let mut output = input.to_string();
    for prefix in ["feather-app-", "feather-mcp-"] {
        while let Some(index) = output.find(prefix) {
            let end = output[index..]
                .find(|ch: char| {
                    ch.is_whitespace() || ch == '"' || ch == '\'' || ch == ',' || ch == '}'
                })
                .map(|offset| index + offset)
                .unwrap_or(output.len());
            output.replace_range(index..end, "[REDACTED]");
        }
    }
    output
}

fn now_iso() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(kind: CliActionKind) -> CliActionRequest {
        CliActionRequest {
            kind,
            project_dir: Some("/game".into()),
            cli_path: None,
            options: None,
            dry_run: None,
            confirmed: None,
        }
    }

    #[test]
    fn maps_doctor_args() {
        let args = action_args(&request(CliActionKind::Doctor)).unwrap();
        assert_eq!(args, vec!["doctor", "/game", "--json"]);
    }

    #[test]
    fn maps_package_install_dry_run_args() {
        let mut req = request(CliActionKind::PackageInstall);
        req.dry_run = Some(true);
        req.options = Some(serde_json::json!({ "names": ["anim8"], "offline": true }));
        let args = action_args(&req).unwrap();
        assert_eq!(
            args,
            vec![
                "package",
                "install",
                "anim8",
                "--dir",
                "/game",
                "--json",
                "--dry-run",
                "--offline"
            ]
        );
    }

    #[test]
    fn maps_config_plugins_confirmed_args() {
        let mut req = request(CliActionKind::ConfigPlugins);
        req.confirmed = Some(true);
        req.options =
            Some(serde_json::json!({ "include": ["console"], "exclude": ["shader-graph"] }));
        let args = action_args(&req).unwrap();
        assert_eq!(
            args,
            vec![
                "config",
                "plugins",
                "--dir",
                "/game",
                "--json",
                "--include",
                "console",
                "--exclude",
                "shader-graph"
            ]
        );
    }

    #[test]
    fn rejects_mutation_without_confirmation() {
        let err = action_args(&request(CliActionKind::PackageInstall)).unwrap_err();
        assert!(err.contains("requires dryRun or confirmed"));
    }

    #[test]
    fn maps_skills_install_dry_run_args() {
        let mut req = request(CliActionKind::SkillsInstall);
        req.dry_run = Some(true);
        req.options = Some(serde_json::json!({ "ids": ["feather-step-debugging"] }));
        let args = action_args(&req).unwrap();
        assert_eq!(
            args,
            vec![
                "skills",
                "install",
                "feather-step-debugging",
                "--dir",
                "/game",
                "--json",
                "--dry-run"
            ]
        );
    }

    #[test]
    fn redacts_known_secret_prefixes() {
        assert_eq!(
            redact_text("app feather-app-123 token feather-mcp-456"),
            "app [REDACTED] token [REDACTED]"
        );
    }

    #[test]
    fn parses_and_redacts_json_payloads() {
        let payload = parse_json_payload(
            r#"prefix {"appId":"feather-app-123","nested":{"apiKey":"secret"}} suffix"#,
        )
        .map(redact_value)
        .unwrap();
        assert_eq!(
            payload,
            serde_json::json!({ "appId": "[REDACTED]", "nested": { "apiKey": "[REDACTED]" } })
        );
    }
}
