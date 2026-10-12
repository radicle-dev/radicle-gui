use std::env;
use std::process::Command;

fn main() {
    let head = env::var("GIT_HEAD").unwrap_or_else(|_| {
        Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .output()
            .map(|output| String::from_utf8(output.stdout).expect("output from Git is UTF-8"))
            .unwrap_or("unknown".into())
    });
    println!("cargo::rustc-env=GIT_HEAD={head}");

    tauri_build::build()
}
