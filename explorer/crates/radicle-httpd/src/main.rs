use std::num::NonZeroUsize;
use std::{collections::HashMap, process};

use anyhow::bail;
use axum_listener::DualAddr;
use radicle::prelude::RepoId;
use radicle::version::Version;
use radicle_httpd as httpd;

pub const VERSION: Version = Version {
    name: "radicle-httpd",
    commit: env!("GIT_HEAD"),
    version: env!("RADICLE_VERSION"),
    timestamp: env!("SOURCE_DATE_EPOCH"),
};

pub const HELP_MSG: &str = r#"
Usage

   radicle-httpd [<option>...]

Options

    --listen       <address>         Address to listen on: TCP address (e.g., 127.0.0.1:8080)
                                     or Unix socket path (e.g., /tmp/radicle.sock)
                                     (default: 0.0.0.0:8080)
    --alias, -a    <alias> <rid>     Provide alias and RID pairs to use in place of the RID for a repository,
                                     e.g. heartwood and rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5 to produce https://seed.radicle.dev/heartwood.git
                                     Aliases work anywhere the RID is accepted: git clone, the JSON API and raw endpoints.
    --cache        <number>          Max amount of items in cache for /tree endpoints (default: 100)
    --version, -v                    Print program version
    --help, -h                       Print help

Environment

    RUST_LOG                         Set the log level (e.g. RUST_LOG=warn, or
                                     RUST_LOG=radicle_httpd=debug). Defaults to "info".
    RADICLE_HTTPD_LOG_FORMAT         Log rendering: text (default) or json.
                                     Unrecognised values fall back to "text".
"#;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // SAFETY: The logger is only initialized once.
    httpd::logger::init().unwrap();
    tracing::info!("starting http daemon..");
    tracing::info!("version {} ({})", env!("RADICLE_VERSION"), env!("GIT_HEAD"));

    let options = parse_options()?;

    match httpd::run(options).await {
        Ok(()) => {}
        Err(err) => {
            tracing::error!("Fatal: {:#}", err);
            process::exit(1);
        }
    }
    Ok(())
}

/// Parse command-line arguments into HTTP options.
fn parse_options() -> anyhow::Result<httpd::Options> {
    use lexopt::prelude::*;

    let mut parser = lexopt::Parser::from_env();
    let mut listen = None;
    let mut aliases = HashMap::new();
    let mut cache = Some(httpd::DEFAULT_CACHE_SIZE);

    while let Some(arg) = parser.next()? {
        match arg {
            Long("listen") => {
                let addr: DualAddr = parser.value()?.parse()?;

                #[cfg(unix)]
                // Get socket path and remove it if existing
                if let DualAddr::Uds(socket_path) = &addr {
                    if let Some(path) = socket_path.as_pathname() {
                        if path.exists() {
                            tracing::info!("Removing existing socket path at {}", path.display());
                            if let Err(e) = std::fs::remove_file(path) {
                                tracing::error!("{e}");
                            }
                        }
                    } else {
                        tracing::error!("Provided socket address isn't a valid path.");
                        process::exit(0);
                    }
                }

                listen = Some(addr);
            }
            Long("alias") | Short('a') => {
                let alias: String = parser.value()?.parse()?;
                let id: RepoId = parser.value()?.parse()?;

                aliases.insert(alias, id);
            }
            Long("version") | Short('v') => {
                if let Err(e) = VERSION.write(std::io::stdout()) {
                    tracing::error!("{e}");
                    process::exit(1);
                };
                process::exit(0);
            }
            Long("cache") => {
                let size = parser.value()?.parse()?;
                cache = NonZeroUsize::new(size);
            }
            Long("help") | Short('h') => {
                println!("{HELP_MSG}");
                process::exit(0);
            }
            _ => return Err(arg.unexpected().into()),
        }
    }
    Ok(httpd::Options {
        aliases,
        listen: listen.unwrap_or_else(|| DualAddr::Tcp(([0, 0, 0, 0], 8080).into())),
        cache,
        search: search_options_from_env()?,
    })
}

/// Read the search backend configuration from the environment. Search is
/// entirely optional and enabled purely at runtime: when `RADICLE_SEARCH_URL`
/// is unset (or empty) this returns `None` and httpd serves repo listings and
/// search from its built-in storage walk. When set, httpd routes activity/
/// seeding sorts and `/repos/search` through the index, transparently falling
/// back to the storage walk if the backend is unreachable.
fn search_options_from_env() -> anyhow::Result<Option<httpd::SearchOptions>> {
    let url = match std::env::var("RADICLE_SEARCH_URL") {
        Ok(url) if !url.is_empty() => url,
        _ => return Ok(None),
    };
    let api_key = std::env::var("RADICLE_SEARCH_KEY")
        .ok()
        .filter(|s| !s.is_empty());
    let index_name = std::env::var("RADICLE_SEARCH_INDEX_NAME")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "repos".to_string());
    let query_timeout = parse_timeout_ms_from_env("RADICLE_SEARCH_TIMEOUT_MS", 500)?;
    Ok(Some(httpd::SearchOptions {
        url,
        api_key,
        index_name,
        query_timeout,
    }))
}

/// Parse a millisecond duration from an env var. Rejects unparseable values
/// and zero (which would make every query time out immediately).
fn parse_timeout_ms_from_env(var: &str, default_ms: u64) -> anyhow::Result<std::time::Duration> {
    let raw = match std::env::var(var) {
        Ok(v) if !v.is_empty() => v,
        _ => return Ok(std::time::Duration::from_millis(default_ms)),
    };
    let ms: u64 = raw
        .parse()
        .map_err(|_| anyhow::anyhow!("{var}={raw:?} is not a non-negative integer"))?;
    if ms == 0 {
        bail!("{var}=0 is not allowed (would time out every query immediately)");
    }
    Ok(std::time::Duration::from_millis(ms))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    // Process-global env vars: each test uses its own variable name so
    // parallel runs don't race.

    #[test]
    fn timeout_unset_returns_default() {
        let d = parse_timeout_ms_from_env("RADICLE_HTTPD_TEST_TIMEOUT_UNSET", 500).unwrap();
        assert_eq!(d, Duration::from_millis(500));
    }

    #[test]
    fn timeout_empty_returns_default() {
        let var = "RADICLE_HTTPD_TEST_TIMEOUT_EMPTY";
        unsafe { std::env::set_var(var, "") };
        let d = parse_timeout_ms_from_env(var, 250);
        unsafe { std::env::remove_var(var) };
        assert_eq!(d.unwrap(), Duration::from_millis(250));
    }

    #[test]
    fn timeout_valid_integer_parses() {
        let var = "RADICLE_HTTPD_TEST_TIMEOUT_VALID";
        unsafe { std::env::set_var(var, "1500") };
        let d = parse_timeout_ms_from_env(var, 500);
        unsafe { std::env::remove_var(var) };
        assert_eq!(d.unwrap(), Duration::from_millis(1500));
    }

    #[test]
    fn timeout_zero_is_rejected() {
        let var = "RADICLE_HTTPD_TEST_TIMEOUT_ZERO";
        unsafe { std::env::set_var(var, "0") };
        let result = parse_timeout_ms_from_env(var, 500);
        unsafe { std::env::remove_var(var) };
        assert!(result.is_err());
    }

    #[test]
    fn timeout_unparseable_is_rejected() {
        let var = "RADICLE_HTTPD_TEST_TIMEOUT_BAD";
        unsafe { std::env::set_var(var, "not-a-number") };
        let result = parse_timeout_ms_from_env(var, 500);
        unsafe { std::env::remove_var(var) };
        assert!(result.is_err());
    }

    #[test]
    fn timeout_negative_is_rejected() {
        let var = "RADICLE_HTTPD_TEST_TIMEOUT_NEG";
        unsafe { std::env::set_var(var, "-5") };
        let result = parse_timeout_ms_from_env(var, 500);
        unsafe { std::env::remove_var(var) };
        assert!(result.is_err());
    }
}
