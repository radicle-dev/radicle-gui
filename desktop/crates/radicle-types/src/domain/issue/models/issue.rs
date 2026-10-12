use thiserror::Error;

/// Issue state filter understood by the COB cache queries.
#[derive(Debug, Clone, Copy)]
pub enum Status {
    Open,
    Closed,
}

impl Status {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Closed => "closed",
        }
    }
}

#[derive(Debug, Error)]
pub enum ListIssuesError {
    #[error(transparent)]
    Sqlite(#[from] sqlite::Error),

    #[error(transparent)]
    Unknown(#[from] anyhow::Error),
    // to be extended as new error scenarios are introduced
}
