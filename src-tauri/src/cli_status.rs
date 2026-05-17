use serde::Serialize;
use serde_json::Value;
use std::{
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Command,
};

const INSTALL_DOCS_URL: &str = "https://kyonru.github.io/feather/installation/";
const CLI_DOCS_URL: &str = "https://kyonru.github.io/feather/cli/";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    installed: bool,
    path: Option<String>,
    version: Option<String>,
    source: Option<String>,
    node_version: Option<String>,
    npm_version: Option<String>,
    error: Option<String>,
    install_docs_url: String,
    cli_docs_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliProjectStatus {
    cli: CliStatus,
    project_dir: String,
    doctor: Option<Value>,
    build_doctor: Option<Value>,
    vendors: Option<Value>,
    errors: Vec<String>,
}

pub fn status(cli_path: Option<String>) -> CliStatus {
    let node_version = command_first_line("node", &["--version"]);
    let npm_version = command_first_line("npm", &["--version"]);

    for (candidate, source) in cli_candidates(cli_path) {
        let version = command_first_line(candidate.as_os_str(), &["--version"]);
        if let Some(version) = version {
            return CliStatus {
                installed: true,
                path: Some(candidate.to_string_lossy().to_string()),
                version: Some(version),
                source: Some(source),
                node_version,
                npm_version,
                error: None,
                install_docs_url: INSTALL_DOCS_URL.to_string(),
                cli_docs_url: CLI_DOCS_URL.to_string(),
            };
        }
    }

    CliStatus {
        installed: false,
        path: None,
        version: None,
        source: None,
        node_version,
        npm_version,
        error: Some(
            "Feather CLI was not found on PATH or in common npm global locations.".to_string(),
        ),
        install_docs_url: INSTALL_DOCS_URL.to_string(),
        cli_docs_url: CLI_DOCS_URL.to_string(),
    }
}

pub fn project_status(project_dir: String, cli_path: Option<String>) -> CliProjectStatus {
    let cli = status(cli_path);
    let mut errors = Vec::new();
    let mut doctor = None;
    let mut build_doctor = None;
    let mut vendors = None;

    if let Some(path) = &cli.path {
        doctor = run_json(path, &["doctor", &project_dir, "--json"], &mut errors);
        build_doctor = run_json(
            path,
            &["doctor", &project_dir, "--json", "--build-target", "all"],
            &mut errors,
        );
        vendors = run_json(
            path,
            &["build", "vendor", "list", "--dir", &project_dir, "--json"],
            &mut errors,
        );
    }

    CliProjectStatus {
        cli,
        project_dir,
        doctor,
        build_doctor,
        vendors,
        errors,
    }
}

fn run_json(command: &str, args: &[&str], errors: &mut Vec<String>) -> Option<Value> {
    match Command::new(command).args(args).output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                errors.push(format!(
                    "{} returned no JSON output: {}",
                    args.join(" "),
                    stderr
                ));
                return None;
            }
            match serde_json::from_str::<Value>(&stdout) {
                Ok(value) => Some(value),
                Err(err) => {
                    errors.push(format!("{} returned invalid JSON: {}", args.join(" "), err));
                    None
                }
            }
        }
        Err(err) => {
            errors.push(format!("Failed to run {}: {}", args.join(" "), err));
            None
        }
    }
}

fn command_first_line<S: AsRef<OsStr>>(command: S, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let text = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr)
    } else {
        String::from_utf8_lossy(&output.stdout)
    };
    text.lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn cli_candidates(cli_path: Option<String>) -> Vec<(PathBuf, String)> {
    let mut candidates = Vec::new();
    if let Some(path) = cli_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        candidates.push((PathBuf::from(path), "configured".to_string()));
    }

    candidates.push((PathBuf::from("feather"), "PATH".to_string()));
    for dir in common_bin_dirs() {
        candidates.push((
            dir.join(executable_name("feather")),
            "common npm bin".to_string(),
        ));
    }

    dedupe_candidates(candidates)
}

fn common_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/bin"),
    ];
    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        dirs.push(home.join(".npm-global/bin"));
        dirs.push(home.join(".volta/bin"));
        dirs.push(home.join(".local/bin"));
    }
    dirs
}

fn executable_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.cmd")
    } else {
        name.to_string()
    }
}

fn dedupe_candidates(candidates: Vec<(PathBuf, String)>) -> Vec<(PathBuf, String)> {
    let mut seen = Vec::<PathBuf>::new();
    let mut result = Vec::new();
    for (path, source) in candidates {
        if seen.iter().any(|item| item == &path) {
            continue;
        }
        seen.push(path.clone());
        result.push((path, source));
    }
    result
}

pub fn resolve_source_location(project_root: &str, relative_file: &str) -> Result<PathBuf, String> {
    let root = canonical_dir(project_root, "Project root")?;
    let relative = Path::new(relative_file);
    if relative.is_absolute() {
        return Err("Source file must be relative to the project root.".to_string());
    }
    if relative
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Source file cannot escape the project root.".to_string());
    }

    let candidate = root.join(relative);
    let resolved = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|err| format!("Could not resolve source file: {err}"))?
    } else {
        let parent = candidate.parent().unwrap_or(&root);
        let resolved_parent = canonical_dir(parent, "Source file parent")?;
        resolved_parent.join(
            candidate
                .file_name()
                .ok_or("Source file is missing a file name.")?,
        )
    };

    if !resolved.starts_with(&root) {
        return Err("Source file is outside the project root.".to_string());
    }

    Ok(resolved)
}

pub fn open_source_location(
    editor_path: String,
    project_root: String,
    relative_file: String,
    line: Option<u32>,
) -> Result<(), String> {
    let editor = validate_editor_path(&editor_path)?;
    let source = resolve_source_location(&project_root, &relative_file)?;
    let line = line.unwrap_or(1).max(1);
    let goto = format!("{}:{line}", source.to_string_lossy());

    Command::new(editor)
        .args(["--goto", &goto])
        .spawn()
        .map_err(|err| format!("Could not open VS Code: {err}"))?;

    Ok(())
}

fn validate_editor_path(editor_path: &str) -> Result<&str, String> {
    let editor = editor_path.trim();
    if editor.is_empty() {
        return Err("Set a VS Code executable path before opening source files.".to_string());
    }
    if editor.contains('\0') {
        return Err("Editor executable path contains an invalid character.".to_string());
    }
    if editor.split_whitespace().count() > 1 && !Path::new(editor).exists() {
        return Err("Editor executable path must not include arguments.".to_string());
    }
    Ok(editor)
}

fn canonical_dir<P: AsRef<Path>>(path: P, label: &str) -> Result<PathBuf, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Err(format!("{label} does not exist."));
    }
    let canonical = path
        .canonicalize()
        .map_err(|err| format!("Could not resolve {label}: {err}"))?;
    if !canonical.is_dir() {
        return Err(format!("{label} must be a directory."));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::{resolve_source_location, validate_editor_path};
    use std::{fs, path::PathBuf};

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("feather-cli-status-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolves_project_relative_file() {
        let dir = temp_dir("valid");
        fs::write(dir.join("main.lua"), "print('hi')").unwrap();
        let resolved = resolve_source_location(dir.to_str().unwrap(), "main.lua").unwrap();
        assert!(resolved.ends_with("main.lua"));
    }

    #[test]
    fn rejects_parent_escape() {
        let dir = temp_dir("escape");
        let err = resolve_source_location(dir.to_str().unwrap(), "../main.lua").unwrap_err();
        assert!(err.contains("escape"));
    }

    #[test]
    fn rejects_editor_arguments() {
        let err = validate_editor_path("code --goto").unwrap_err();
        assert!(err.contains("arguments"));
    }

    #[test]
    fn accepts_existing_editor_path_with_spaces() {
        let dir = temp_dir("editor spaces");
        let editor = dir.join("Code CLI");
        fs::write(&editor, "").unwrap();
        let validated = validate_editor_path(editor.to_str().unwrap()).unwrap();
        assert!(validated.ends_with("Code CLI"));
    }
}
