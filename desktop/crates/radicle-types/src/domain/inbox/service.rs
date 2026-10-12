use radicle::identity;

use crate::domain::inbox::models::notification::{
    CountByRepo, ListNotificationsError, RepoGroup, RepoGroupParams,
};
use crate::domain::inbox::traits::{InboxService, InboxStorage};

#[derive(Debug, Clone)]
pub struct Service<I>
where
    I: InboxStorage,
{
    inbox: I,
}

impl<I> Service<I>
where
    I: InboxStorage,
{
    pub fn new(inbox: I) -> Self {
        Self { inbox }
    }
}

impl<I> InboxService for Service<I>
where
    I: InboxStorage,
{
    fn counts_by_repo(
        &self,
    ) -> Result<
        impl Iterator<Item = Result<CountByRepo, ListNotificationsError>>,
        ListNotificationsError,
    > {
        self.inbox.counts_by_repo()
    }

    fn notification_count(&self) -> Result<usize, ListNotificationsError> {
        self.inbox.notification_count()
    }

    fn repo_group(
        &self,
        params: RepoGroupParams,
    ) -> Result<Vec<(identity::RepoId, RepoGroup)>, ListNotificationsError> {
        self.inbox.repo_group(params)
    }
}
