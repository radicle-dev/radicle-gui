use radicle::identity;
use radicle::issue::{Issue, IssueId};

use crate::domain::issue::models;
use crate::domain::issue::traits::{IssueService, IssueStorage};

#[derive(Debug, Clone)]
pub struct Service<I>
where
    I: IssueStorage,
{
    issues: I,
}

impl<I> Service<I>
where
    I: IssueStorage,
{
    pub fn new(issues: I) -> Self {
        Self { issues }
    }
}

impl<I> IssueService for Service<I>
where
    I: IssueStorage,
{
    fn list(
        &self,
        rid: identity::RepoId,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, models::issue::ListIssuesError> {
        self.issues.list(rid)
    }

    fn list_by_status(
        &self,
        rid: identity::RepoId,
        status: models::issue::Status,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, models::issue::ListIssuesError> {
        self.issues.list_by_status(rid, status)
    }
}
