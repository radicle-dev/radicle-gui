pub mod client;
pub mod cob;
pub mod inventory;
pub mod node;
pub mod policy;
pub mod repo;

use anyhow::{Context, Result};
use meilisearch_sdk::client::Client;

use crate::config::Config;

/// Version stamped into every document as `"v"`. httpd refuses documents
/// with a different version, which makes indexer/httpd deploys safe to
/// order: deploy radicle-search first, let the rescan rewrite documents.
pub const SCHEMA_VERSION: u32 = 1;

/// Meilisearch's search route silently truncates results beyond
/// `pagination.maxTotalHits` (default 1000). httpd's rid-sort enumeration
/// and deep list pagination need to see further than that on large
/// instances, so the repo and cob indexes raise the cap to this value.
pub const MAX_TOTAL_HITS: usize = 10_000;

/// Handles to the six Meilisearch indexes owned by radicle-search.
pub struct Indexes {
    pub repos: client::Index,
    pub issues: client::Index,
    pub patches: client::Index,
    pub nodes: client::Index,
    pub policies: client::Index,
    pub inventory: client::Index,
}

impl Indexes {
    pub fn connect(url: &str, key: Option<&str>, config: &Config) -> Result<Self> {
        let client = Client::new(url, key).context("failed to construct Meilisearch client")?;
        let wait = client::TaskWait {
            interval: config.task_poll_interval,
            timeout: config.task_timeout,
        };
        Ok(Self {
            repos: client::Index::new(&client, &config.index_name("repos"), wait),
            issues: client::Index::new(&client, &config.index_name("issues"), wait),
            patches: client::Index::new(&client, &config.index_name("patches"), wait),
            nodes: client::Index::new(&client, &config.index_name("nodes"), wait),
            policies: client::Index::new(&client, &config.index_name("policies"), wait),
            inventory: client::Index::new(&client, &config.index_name("inventory"), wait),
        })
    }

    pub async fn configure_all_with_retry(&self) -> Result<()> {
        self.repos.configure_with_retry(&repo::settings()).await?;
        self.issues.configure_with_retry(&cob::settings()).await?;
        self.patches.configure_with_retry(&cob::settings()).await?;
        self.nodes.configure_with_retry(&node::settings()).await?;
        self.policies
            .configure_with_retry(&policy::settings())
            .await?;
        self.inventory
            .configure_with_retry(&inventory::settings())
            .await?;
        Ok(())
    }
}
