//! Checks that the Tauri commands, the HTTP routes and the frontend's
//! `invoke` calls match.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Tauri commands with no HTTP route, and why.
const TAURI_ONLY: &[(&str, &str)] = &[
    (
        "pick_artifact_files",
        "opens a native file dialog, which the HTTP server has no access to",
    ),
    (
        "pick_artifact_directory",
        "opens a native file dialog, which the HTTP server has no access to",
    ),
];

/// HTTP routes with no Tauri command, and why.
const HTTP_ONLY: &[(&str, &str)] = &[(
    "node_running",
    "stands in for the `node_running` event that the Tauri driver emits",
)];

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(path: &str) -> String {
    fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("reading {path}: {e}"))
}

fn tauri_commands() -> Vec<String> {
    let source = read("crates/radicle-tauri/src/lib.rs");
    let start = source
        .find("generate_handler![")
        .expect("`generate_handler!` in radicle-tauri")
        + "generate_handler![".len();
    let end = start
        + source[start..]
            .find(']')
            .expect("end of `generate_handler!`");

    source[start..end]
        .split(',')
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
        .map(|path| path.rsplit("::").next().unwrap_or(path).to_string())
        .collect()
}

fn http_routes() -> Vec<String> {
    let source = read("crates/test-http-api/src/api.rs");

    source
        .split(".route(")
        .skip(1)
        .filter_map(|rest| rest.trim_start().strip_prefix("\"/"))
        .filter_map(|rest| rest.split('"').next())
        .map(str::to_string)
        .collect()
}

fn source_files(dir: &Path, files: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).unwrap_or_else(|e| panic!("reading {dir:?}: {e}")) {
        let path = entry.expect("directory entry").path();
        if path.is_dir() {
            source_files(&path, files);
        } else if path
            .extension()
            .is_some_and(|ext| ext == "ts" || ext == "svelte")
        {
            files.push(path);
        }
    }
}

fn invoked_command(after: &str) -> Option<String> {
    let mut rest = after;
    if rest.starts_with('<') {
        let mut depth = 0;
        let end = rest.char_indices().find_map(|(i, c)| {
            match c {
                '<' => depth += 1,
                '>' => depth -= 1,
                _ => {}
            }
            (depth == 0).then_some(i)
        })?;
        rest = &rest[end + 1..];
    }
    let rest = rest.strip_prefix('(').or_else(|| rest.strip_prefix(','))?;
    let rest = rest.trim_start().strip_prefix('"')?;
    let name = &rest[..rest.find('"')?];

    name.chars()
        .all(|c| c.is_ascii_lowercase() || c == '_')
        .then(|| name.to_string())
}

fn frontend_commands() -> BTreeSet<String> {
    let mut files = Vec::new();
    source_files(&root().join("src"), &mut files);

    files
        .iter()
        .flat_map(|file| {
            let source = fs::read_to_string(file).expect("frontend source");
            source
                .split("invoke")
                .skip(1)
                .filter_map(invoked_command)
                .collect::<Vec<_>>()
        })
        .collect()
}

fn names(list: &[(&str, &str)]) -> BTreeSet<String> {
    list.iter().map(|(name, _)| name.to_string()).collect()
}

fn duplicates(list: &[String]) -> BTreeSet<String> {
    let mut seen = BTreeSet::new();
    list.iter()
        .filter(|name| !seen.insert(name.as_str()))
        .cloned()
        .collect()
}

#[test]
fn commands_are_registered_once() {
    assert_eq!(duplicates(&tauri_commands()), BTreeSet::new(), "Tauri");
    assert_eq!(duplicates(&http_routes()), BTreeSet::new(), "HTTP");
}

#[test]
fn every_tauri_command_has_an_http_route() {
    let tauri: BTreeSet<_> = tauri_commands().into_iter().collect();
    let http: BTreeSet<_> = http_routes().into_iter().collect();
    let missing: BTreeSet<_> = tauri
        .difference(&http)
        .filter(|name| !names(TAURI_ONLY).contains(*name))
        .cloned()
        .collect();

    assert_eq!(
        missing,
        BTreeSet::new(),
        "Add a route to crates/test-http-api/src/api.rs, or list the command in TAURI_ONLY"
    );
}

#[test]
fn every_http_route_has_a_tauri_command() {
    let tauri: BTreeSet<_> = tauri_commands().into_iter().collect();
    let http: BTreeSet<_> = http_routes().into_iter().collect();
    let extra: BTreeSet<_> = http
        .difference(&tauri)
        .filter(|name| !names(HTTP_ONLY).contains(*name))
        .cloned()
        .collect();

    assert_eq!(
        extra,
        BTreeSet::new(),
        "Remove the route, or list it in HTTP_ONLY"
    );
}

#[test]
fn exceptions_are_still_needed() {
    let tauri: BTreeSet<_> = tauri_commands().into_iter().collect();
    let http: BTreeSet<_> = http_routes().into_iter().collect();

    for name in names(TAURI_ONLY) {
        assert!(
            tauri.contains(&name),
            "{name} in TAURI_ONLY is not a Tauri command"
        );
        assert!(
            !http.contains(&name),
            "{name} in TAURI_ONLY has an HTTP route"
        );
    }
    for name in names(HTTP_ONLY) {
        assert!(
            http.contains(&name),
            "{name} in HTTP_ONLY is not an HTTP route"
        );
        assert!(
            !tauri.contains(&name),
            "{name} in HTTP_ONLY is a Tauri command"
        );
    }
}

#[test]
fn every_frontend_command_exists() {
    let backend: BTreeSet<_> = tauri_commands()
        .into_iter()
        .chain(names(HTTP_ONLY))
        .collect();
    let unknown: BTreeSet<_> = frontend_commands().difference(&backend).cloned().collect();

    assert_eq!(
        unknown,
        BTreeSet::new(),
        "The frontend invokes commands that no driver implements"
    );
}

#[test]
fn frontend_command_scan_finds_commands() {
    // Guards against the scan above silently matching nothing.
    let commands = frontend_commands();
    for name in ["startup", "list_issues", "list_patches", "node_running"] {
        assert!(commands.contains(name), "{name} not found in the frontend");
    }
}
