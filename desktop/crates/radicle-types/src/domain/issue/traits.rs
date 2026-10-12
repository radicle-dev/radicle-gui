use radicle::identity;
use radicle::issue::{Issue, IssueId};
use radicle::node::AliasStore;

use crate::cobs;
use crate::domain::issue::models;
use crate::domain::issue::models::issue::Status;

pub trait IssueStorage {
    fn list(
        &self,
        rid: identity::RepoId,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, models::issue::ListIssuesError>;

    fn list_by_status(
        &self,
        rid: identity::RepoId,
        status: Status,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, models::issue::ListIssuesError>;
}

pub trait IssueService {
    fn list(
        &self,
        rid: identity::RepoId,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, models::issue::ListIssuesError>;

    fn list_by_status(
        &self,
        rid: identity::RepoId,
        status: Status,
    ) -> Result<impl Iterator<Item = (IssueId, Issue)>, models::issue::ListIssuesError>;

    /// One page of issue summaries, shared by all drivers so pagination
    /// behaves identically everywhere. Rows are consumed lazily: with `take`
    /// set, issues beyond the requested page are never deserialized. Without
    /// `take` the full list is returned and `skip` is ignored.
    fn list_paginated(
        &self,
        rid: identity::RepoId,
        status: cobs::query::IssueStatus,
        skip: Option<usize>,
        take: Option<usize>,
        aliases: &impl AliasStore,
    ) -> Result<cobs::PaginatedQuery<Vec<cobs::issue::Issue>>, models::issue::ListIssuesError> {
        let issues: Box<dyn Iterator<Item = (IssueId, Issue)> + '_> = match status {
            cobs::query::IssueStatus::All => Box::new(self.list(rid)?),
            cobs::query::IssueStatus::Open => Box::new(self.list_by_status(rid, Status::Open)?),
            cobs::query::IssueStatus::Closed => Box::new(self.list_by_status(rid, Status::Closed)?),
        };
        let summary =
            |(id, issue): (IssueId, Issue)| cobs::issue::Issue::summary(&id, &issue, aliases);

        match take {
            None => Ok(cobs::PaginatedQuery {
                cursor: 0,
                more: false,
                content: issues.map(summary).collect::<Vec<_>>(),
            }),
            Some(take) => {
                let cursor = skip.unwrap_or(0);
                let mut content = issues
                    .skip(cursor)
                    .take(take + 1)
                    .map(summary)
                    .collect::<Vec<_>>();
                let more = content.len() > take;
                content.truncate(take);

                Ok(cobs::PaginatedQuery {
                    cursor,
                    more,
                    content,
                })
            }
        }
    }
}
