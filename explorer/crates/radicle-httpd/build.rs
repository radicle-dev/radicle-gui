use std::env;
use std::process::Command;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Set a build-time `GIT_HEAD` env var which includes the commit id;
    // such that we can tell which code is running.
    let hash = env::var("GIT_HEAD").unwrap_or_else(|_| {
        Command::new("git")
            .arg("rev-parse")
            .arg("--short")
            .arg("HEAD")
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    String::from_utf8(output.stdout).ok()
                } else {
                    None
                }
            })
            .unwrap_or("unknown".into())
    });

    let version = if let Ok(version) = env::var("RADICLE_VERSION") {
        version
    } else {
        "pre-release".to_owned()
    };

    // Set a build-time `SOURCE_DATE_EPOCH` env var which includes the commit time.
    let commit_time = env::var("SOURCE_DATE_EPOCH")
        .unwrap_or_else(|_| git_commit_time().unwrap_or(0.to_string()));

    // Set a build-time `RADICLE_RELEASED_AT` env var with the release date.
    // Unlike `SOURCE_DATE_EPOCH`, it has no default that build tools set, such
    // as Nix's 1980. It is empty if the build has no date.
    let released_at = env::var("RADICLE_RELEASED_AT")
        .ok()
        .or_else(git_commit_time)
        .unwrap_or_default();

    println!("cargo::rustc-env=RADICLE_VERSION={version}");
    println!("cargo::rustc-env=SOURCE_DATE_EPOCH={commit_time}");
    println!("cargo::rustc-env=RADICLE_RELEASED_AT={released_at}");
    println!("cargo::rustc-env=GIT_HEAD={hash}");

    Ok(())
}

fn git_commit_time() -> Option<String> {
    Command::new("git")
        .arg("log")
        .arg("-1")
        .arg("--pretty=%ct")
        .arg("HEAD")
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout).ok()
            } else {
                None
            }
        })
}
