use std::process;
use std::sync::Arc;

use anyhow::{Context, Result};
use radicle::Profile;
use radicle_search::config::Config;
use radicle_search::index::repo;
use radicle_search::indexer::Indexer;

const HELP_MSG: &str = r#"
Usage

   radicle-search [<option>...]

Options

    --help, -h                  Print help

Environment

    RADICLE_SEARCH_MEILI_URL           Meilisearch base URL (default: http://localhost:7700)
    RADICLE_SEARCH_MEILI_KEY           Meilisearch API key (optional)
    RADICLE_SEARCH_INDEX_NAME          Meilisearch index name (default: repos)
    RADICLE_SEARCH_RESCAN_SECS         Periodic full rescan interval in seconds (default: 3600)
    RADICLE_SEARCH_RECONNECT_BACKOFF_SECS  Reconnect delay after a dropped event stream (default: 5)
    RADICLE_SEARCH_BATCH_SECS          Interval for re-indexing repos touched by events (default: 30)
    RAD_HOME, RAD_SOCKET               Standard Radicle paths
    RUST_LOG                           Log level, e.g. RUST_LOG=warn or
                                       RUST_LOG=radicle_search=debug (default: info)
"#;

#[tokio::main]
async fn main() {
    init_tracing();

    if let Err(e) = parse_args() {
        eprintln!("error: {e}");
        process::exit(1);
    }

    if let Err(e) = run().await {
        tracing::error!("fatal: {e:#}");
        process::exit(1);
    }
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();
}

fn parse_args() -> Result<()> {
    use lexopt::prelude::*;

    let mut parser = lexopt::Parser::from_env();
    if let Some(arg) = parser.next()? {
        match arg {
            Long("help") | Short('h') => {
                println!("{HELP_MSG}");
                process::exit(0);
            }
            _ => return Err(anyhow::anyhow!("{}", arg.unexpected())),
        }
    }
    Ok(())
}

async fn run() -> Result<()> {
    let config = Config::from_env()?;
    tracing::info!("meili={}, index={}", config.meili_url, config.index_name);

    let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);
    tokio::spawn(async move {
        #[cfg(unix)]
        {
            use tokio::signal::unix::{SignalKind, signal};
            let mut sigterm =
                signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
            tokio::select! {
                _ = tokio::signal::ctrl_c() => tracing::info!("SIGINT received, shutting down"),
                _ = sigterm.recv() => tracing::info!("SIGTERM received, shutting down"),
            }
        }
        #[cfg(not(unix))]
        {
            let _ = tokio::signal::ctrl_c().await;
            tracing::info!("SIGINT received, shutting down");
        }
        let _ = shutdown_tx.send(true);
    });

    let profile = Arc::new(Profile::load().context("failed to load Radicle profile")?);
    tracing::info!("loaded profile at {}", profile.home().path().display());

    let index = Arc::new(repo::Index::connect(
        &config.meili_url,
        config.meili_key.as_deref(),
        &config.index_name,
    )?);
    tokio::select! {
        _ = shutdown_rx.changed() => return Ok(()),
        res = index.configure_with_retry() => res?,
    }

    let indexer = Indexer::new(profile, index, config);
    indexer.run(shutdown_rx).await?;
    Ok(())
}
