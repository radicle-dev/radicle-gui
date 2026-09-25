use std::env;
use std::time::Duration;

use anyhow::{Context, Result, bail};

const DEFAULT_MEILI_URL: &str = "http://localhost:7700";
const DEFAULT_RESCAN_INTERVAL_SECS: u64 = 3600;
const DEFAULT_RECONNECT_BACKOFF_SECS: u64 = 5;
const DEFAULT_BATCH_SECS: u64 = 30;
const DEFAULT_TASK_POLL_SECS: u64 = 1;
const DEFAULT_TASK_TIMEOUT_SECS: u64 = 600;

#[derive(Debug, Clone)]
pub struct Config {
    pub meili_url: String,
    pub meili_key: Option<String>,
    pub index_prefix: String,
    pub rescan_interval: Duration,
    pub reconnect_backoff: Duration,
    pub batch_interval: Duration,
    pub task_poll_interval: Duration,
    pub task_timeout: Duration,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let meili_url =
            env::var("RADICLE_SEARCH_MEILI_URL").unwrap_or_else(|_| DEFAULT_MEILI_URL.to_string());
        let meili_key = env::var("RADICLE_SEARCH_MEILI_KEY")
            .ok()
            .filter(|k| !k.is_empty());
        let index_prefix = index_prefix_from_env("RADICLE_SEARCH_INDEX_PREFIX");
        let rescan_interval =
            duration_from_env("RADICLE_SEARCH_RESCAN_SECS", DEFAULT_RESCAN_INTERVAL_SECS)?;
        let reconnect_backoff = duration_from_env(
            "RADICLE_SEARCH_RECONNECT_BACKOFF_SECS",
            DEFAULT_RECONNECT_BACKOFF_SECS,
        )?;
        let batch_interval = duration_from_env("RADICLE_SEARCH_BATCH_SECS", DEFAULT_BATCH_SECS)?;
        let task_poll_interval =
            duration_from_env("RADICLE_SEARCH_TASK_POLL_SECS", DEFAULT_TASK_POLL_SECS)?;
        let task_timeout = duration_from_env(
            "RADICLE_SEARCH_TASK_TIMEOUT_SECS",
            DEFAULT_TASK_TIMEOUT_SECS,
        )?;

        Ok(Self {
            meili_url,
            meili_key,
            index_prefix,
            rescan_interval,
            reconnect_backoff,
            batch_interval,
            task_poll_interval,
            task_timeout,
        })
    }

    /// Full index name for a base name, e.g. `index_name("repos")`.
    pub fn index_name(&self, base: &str) -> String {
        format!("{}{base}", self.index_prefix)
    }
}

fn index_prefix_from_env(var: &str) -> String {
    env::var(var).unwrap_or_default()
}

fn duration_from_env(var: &str, default_secs: u64) -> Result<Duration> {
    let raw = match env::var(var) {
        Ok(v) if !v.is_empty() => v,
        _ => return Ok(Duration::from_secs(default_secs)),
    };
    let secs: u64 = raw
        .parse()
        .with_context(|| format!("{var}={raw:?} is not a non-negative integer"))?;
    if secs == 0 {
        bail!("{var}=0 is not allowed (would cause a tight loop or panic)");
    }
    Ok(Duration::from_secs(secs))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Process-global env vars: each test uses its own variable name so
    // parallel runs don't race.

    #[test]
    fn unset_returns_default() {
        let d = duration_from_env("RADICLE_SEARCH_TEST_UNSET", 42).unwrap();
        assert_eq!(d, Duration::from_secs(42));
    }

    #[test]
    fn empty_returns_default() {
        let var = "RADICLE_SEARCH_TEST_EMPTY";
        unsafe { env::set_var(var, "") };
        let d = duration_from_env(var, 7);
        unsafe { env::remove_var(var) };
        assert_eq!(d.unwrap(), Duration::from_secs(7));
    }

    #[test]
    fn valid_integer_parses() {
        let var = "RADICLE_SEARCH_TEST_VALID";
        unsafe { env::set_var(var, "15") };
        let d = duration_from_env(var, 99);
        unsafe { env::remove_var(var) };
        assert_eq!(d.unwrap(), Duration::from_secs(15));
    }

    #[test]
    fn zero_is_rejected() {
        let var = "RADICLE_SEARCH_TEST_ZERO";
        unsafe { env::set_var(var, "0") };
        let result = duration_from_env(var, 99);
        unsafe { env::remove_var(var) };
        assert!(result.is_err());
    }

    #[test]
    fn unparseable_is_rejected() {
        let var = "RADICLE_SEARCH_TEST_GARBAGE";
        unsafe { env::set_var(var, "not-a-number") };
        let result = duration_from_env(var, 99);
        unsafe { env::remove_var(var) };
        assert!(result.is_err());
    }

    #[test]
    fn negative_is_rejected() {
        let var = "RADICLE_SEARCH_TEST_NEG";
        unsafe { env::set_var(var, "-5") };
        let result = duration_from_env(var, 99);
        unsafe { env::remove_var(var) };
        assert!(result.is_err());
    }

    #[test]
    fn index_name_joins_prefix_and_base() {
        let config = Config {
            meili_url: "http://localhost:7700".into(),
            meili_key: None,
            index_prefix: "staging-".into(),
            rescan_interval: Duration::from_secs(1),
            reconnect_backoff: Duration::from_secs(1),
            batch_interval: Duration::from_secs(1),
            task_poll_interval: Duration::from_secs(1),
            task_timeout: Duration::from_secs(1),
        };
        assert_eq!(config.index_name("repos"), "staging-repos");
    }
}
