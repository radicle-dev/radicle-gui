use serde_json as json;
use thiserror::Error;

use radicle::git::Oid;
use radicle::git::raw as git2;

#[derive(Debug, Error)]
#[error("failed to construct stream: {err}")]
pub struct Stream {
    #[source]
    err: Box<dyn std::error::Error + Send + Sync + 'static>,
}

impl Stream {
    pub fn new<E>(err: E) -> Self
    where
        E: std::error::Error + Send + Sync + 'static,
    {
        Stream { err: err.into() }
    }
}

#[derive(Debug, Error)]
pub enum Actions {
    #[error("failed to get a commit while iterating over stream: {err}")]
    Commit {
        #[source]
        err: git2::Error,
    },
    #[error("failed to get associated tree for commit {oid}: {err}")]
    Tree {
        oid: Oid,
        #[source]
        err: git2::Error,
    },
    #[error("failed to get COB manifest entry in tree {oid}: {err}")]
    ManifestPath {
        oid: Oid,
        #[source]
        err: git2::Error,
    },
    #[error("failed to deserialize the COB manifest {oid}: {err}")]
    Manifest {
        oid: Oid,
        #[source]
        err: json::Error,
    },
    #[error(transparent)]
    TreeAction(#[from] TreeAction),
}

#[derive(Debug, Error)]
pub enum TreeAction {
    #[error("could not peel the tree entry to an object: {err}")]
    InvalidEntry {
        #[source]
        err: git2::Error,
    },
    #[error("expected git blob but found {obj}")]
    InvalidObject { obj: String },
    #[error(transparent)]
    Action(#[from] Action),
}

#[derive(Debug, Error)]
#[error("failed to deserialize action {oid}: {err}")]
pub struct Action {
    oid: Oid,
    #[source]
    err: json::Error,
}

impl Action {
    pub fn new(oid: Oid, err: json::Error) -> Self {
        Self { oid, err }
    }
}
