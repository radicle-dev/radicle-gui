//! Locating the external binaries the app shells out to.
//!
//! A desktop launch inherits its environment from the OS session manager
//! rather than from a shell, so `PATH` holds none of the user's own install
//! locations: on macOS launchd hands out `/usr/bin:/bin:/usr/sbin:/sbin`,
//! which covers neither Homebrew nor Nix nor anything under the home
//! directory. So we look at `PATH` first and the usual install locations
//! after it.
//!
//! Everything the app runs `git` for it can also do through libgit2, only slower.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Serialize;
use ts_rs::TS;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
// See <https://learn.microsoft.com/windows/win32/procthread/process-creation-flags#flags>.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Environment variable that pins the git binary, skipping detection.
pub const GIT_ENV: &str = "RAD_DESKTOP_GIT";

/// How long a candidate gets to answer `--version`. Only here so that a
/// candidate which never exits does not block resolution forever.
const PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// Apple's `git` is a shim present on every macOS install whether or not git
/// is. Without the Command Line Developer Tools, running it only opens a
/// dialog offering to install them. See [`command_line_tools_installed`].
#[cfg(target_os = "macos")]
const APPLE_GIT_SHIM: &str = "/usr/bin/git";

/// The resolved git binary, for display in the settings. Both fields are unset
/// when no git was found.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "config/")]
pub struct GitInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub version: Option<String>,
}

#[derive(Clone, Debug)]
struct Git {
    path: PathBuf,
    version: String,
}

/// `None` means "searched and found nothing", cached so that a machine without git does not rescan
/// on every diff.
static GIT: OnceLock<Option<Git>> = OnceLock::new();

pub fn git() -> Option<PathBuf> {
    resolve().map(|git| git.path)
}

pub fn git_info() -> GitInfo {
    match resolve() {
        Some(git) => GitInfo {
            path: Some(git.path.to_string_lossy().into_owned()),
            version: Some(git.version),
        },
        None => GitInfo {
            path: None,
            version: None,
        },
    }
}

fn resolve() -> Option<Git> {
    GIT.get_or_init(|| {
        let git = search();
        match &git {
            Some(git) => log::info!("Using git binary {}: {}", git.path.display(), git.version),
            None => log::warn!(
                "No working git binary found; falling back to libgit2 for diff stats, \
                 commit counts and file history, which is slower on large repositories"
            ),
        }

        git
    })
    .clone()
}

/// A [`std::process::Command`] for the resolved binary. Spawning git anywhere
/// else risks forgetting `CREATE_NO_WINDOW` and flashing up a console window
/// on Windows.
pub fn git_command() -> Option<std::process::Command> {
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut command = std::process::Command::new(git()?);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    Some(command)
}

pub fn check_radicle_cli(profile: &radicle::Profile) -> Result<(), crate::error::Error> {
    if profile.home().path().join("bin").join("rad").exists() || rad().is_some() {
        return Ok(());
    }

    Err(crate::error::Error::RadicleNotInstalled)
}

/// The `rad` CLI, if it is installed.
///
/// Uncached: the app polls for it so that installing the CLI while the app is
/// running lifts the "Radicle CLI not installed" warning without a restart.
pub fn rad() -> Option<PathBuf> {
    candidates("rad").find(|path| path.is_file())
}

#[cfg(windows)]
const RAD_ARTIFACT_BIN: &str = "rad-artifact.exe";
#[cfg(not(windows))]
const RAD_ARTIFACT_BIN: &str = "rad-artifact";

#[cfg(windows)]
const RAD_ARTIFACT_NODE_BIN: &str = "rad-artifact-node.exe";
#[cfg(not(windows))]
const RAD_ARTIFACT_NODE_BIN: &str = "rad-artifact-node";

/// Which of the artifact binaries are installed.
///
/// `rad-artifact node start` only starts the daemon; the daemon itself is the
/// separate `rad-artifact-node` binary, installed by its own crate. So the two
/// can be missing independently, and "install it" is different advice from
/// "start it".
///
/// Uncached for the same reason as [`rad`]: the UI polls, so an install that
/// happens while the app runs takes effect without a restart.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "artifact/")]
pub struct ArtifactBinaries {
    /// The `rad-artifact` CLI.
    pub cli: bool,
    /// Version of the `rad-artifact` CLI, when it answers `--version`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cli_version: Option<String>,
    /// The `rad-artifact-node` seeding daemon.
    pub node: bool,
}

pub fn artifact_binaries() -> ArtifactBinaries {
    let cli = candidates(RAD_ARTIFACT_BIN).find(|path| path.is_file());
    // `rad-artifact --version` prints the crate name before the version.
    let cli_version = cli.as_deref().and_then(probe).map(|version| {
        version
            .rsplit_once(' ')
            .map_or(version.clone(), |(_, v)| v.to_owned())
    });

    ArtifactBinaries {
        cli: cli.is_some(),
        cli_version,
        node: candidates(RAD_ARTIFACT_NODE_BIN).any(|path| path.is_file()),
    }
}

/// Everywhere a binary called `name` might be, `PATH` first so that the user's
/// own choice wins.
fn candidates(name: &str) -> impl Iterator<Item = PathBuf> {
    // Homebrew on Apple silicon and Intel, MacPorts, Nix profiles, and the
    // directory the Radicle installer uses.
    #[cfg(unix)]
    const DIRS: &[&str] = &[
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/local/bin",
        "~/.nix-profile/bin",
        "/nix/var/nix/profiles/default/bin",
        "/run/current-system/sw/bin",
        "~/.local/bin",
        "~/.radicle/bin",
    ];
    #[cfg(windows)]
    const DIRS: &[&str] = &[];

    let name = name.to_owned();
    // Collected because the iterator `which_all` hands back borrows the name.
    let path = which::which_all(&name)
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let known = DIRS.iter().filter_map(move |dir| {
        let dir = match dir.strip_prefix("~/") {
            Some(rest) => PathBuf::from(std::env::var_os("HOME")?).join(rest),
            None => PathBuf::from(dir),
        };

        Some(dir.join(&name))
    });

    path.into_iter().chain(known)
}

fn search() -> Option<Git> {
    if let Some(pinned) = std::env::var_os(GIT_ENV) {
        let path = PathBuf::from(pinned);
        match validate(&path) {
            Some(version) => {
                log::info!("{GIT_ENV} pins git to {}", path.display());

                return Some(Git { path, version });
            }
            None => log::warn!(
                "{GIT_ENV} is set to {}, which does not run git; detecting instead",
                path.display()
            ),
        }
    }

    detect()
}

/// Also looks in the 64-bit, 32-bit and per-user program files directories.
/// `Git\cmd\git.exe` is the wrapper Git for Windows means for others to call,
/// as opposed to the bare executable under `Git\mingw64\bin`.
#[cfg(windows)]
fn detect() -> Option<Git> {
    const PROGRAM_FILES: &[&str] = &["ProgramW6432", "ProgramFiles(x86)", "ProgramFiles"];

    let program_files = PROGRAM_FILES
        .iter()
        .filter_map(|var| Some(PathBuf::from(std::env::var_os(var)?).join(r"Git\cmd\git.exe")));
    let local = std::env::var_os("LocalAppData")
        .map(|base| PathBuf::from(base).join(r"Programs\Git\cmd\git.exe"));

    candidates("git.exe")
        .chain(program_files)
        .chain(local)
        .find_map(|path| validate(&path).map(|version| Git { path, version }))
}

#[cfg(not(windows))]
fn detect() -> Option<Git> {
    for path in candidates("git") {
        // Skipping the shim has to leave a git further down the list still
        // reachable, hence a list of candidates rather than just the first
        // `git` on `PATH`.
        #[cfg(target_os = "macos")]
        if path == Path::new(APPLE_GIT_SHIM) && !command_line_tools_installed() {
            log::info!(
                "Skipping {APPLE_GIT_SHIM}: the Command Line Developer Tools are not installed, \
                 so running it would only prompt to install them"
            );
            continue;
        }
        if let Some(version) = validate(&path) {
            return Some(Git { path, version });
        }
    }

    None
}

/// Whether Apple's `git` shim has a real git to hand off to.
///
/// `xcode-select -p` answers with the active developer directory, which ships git either way. It
/// exits with 2 when there is none, which is the case where the shim prompts instead of running
/// git. The directory it names can also have been deleted since, so it has to still exist.
/// `xcode-select` is a real binary rather than a shim, so asking has no side effects.
#[cfg(target_os = "macos")]
fn command_line_tools_installed() -> bool {
    let Ok(output) = std::process::Command::new("/usr/bin/xcode-select")
        .arg("-p")
        .output()
        .inspect_err(|e| log::warn!("Could not run xcode-select: {e}"))
    else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let developer_dir = String::from_utf8_lossy(&output.stdout).trim().to_owned();

    !developer_dir.is_empty() && Path::new(&developer_dir).is_dir()
}

/// The version a candidate reports, or `None` if it is not a git we can use.
fn validate(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let version = probe(path)?;

    if !version.starts_with("git version ") {
        log::warn!(
            "{} answers `--version` with {version:?} rather than a git version",
            path.display()
        );

        return None;
    }

    Some(version)
}

/// Asks a candidate for its version, giving up after [`PROBE_TIMEOUT`].
fn probe(path: &Path) -> Option<String> {
    use std::io::Read;

    let mut command = std::process::Command::new(path);
    command
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().ok()?;

    // Waiting for the exit before reading: a candidate that prints more than
    // the pipe holds would block on us while we block on it, and the deadline
    // breaks that too.
    let deadline = std::time::Instant::now() + PROBE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) | Err(_) => return None,
            Ok(None) => {}
        }
        if std::time::Instant::now() >= deadline {
            log::warn!(
                "{} did not answer `--version` within {}s, giving up",
                path.display(),
                PROBE_TIMEOUT.as_secs()
            );
            let _ = child.kill();
            let _ = child.wait();

            return None;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    // The process is gone and its output is a single line well within the
    // pipe's capacity, so this reads what is already buffered.
    let mut version = Vec::new();
    child.stdout.take()?.read_to_end(&mut version).ok()?;

    Some(String::from_utf8_lossy(&version).trim().to_string())
}
