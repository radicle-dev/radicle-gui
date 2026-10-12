use radicle::identity;

use crate::domain::inbox::models::notification::{
    CountByRepo, ListNotificationsError, RepoGroupParams,
};

use super::models::notification::RepoGroup;

pub trait InboxStorage {
    fn counts_by_repo(
        &self,
    ) -> Result<
        impl Iterator<Item = Result<CountByRepo, ListNotificationsError>>,
        ListNotificationsError,
    >;

    fn notification_count(&self) -> Result<usize, ListNotificationsError>;

    fn repo_group(
        &self,
        params: RepoGroupParams,
    ) -> Result<Vec<(identity::RepoId, RepoGroup)>, ListNotificationsError>;
}

pub trait InboxService {
    /// Get the total notification count by repos.
    fn counts_by_repo(
        &self,
    ) -> Result<
        impl Iterator<Item = Result<CountByRepo, ListNotificationsError>>,
        ListNotificationsError,
    >;

    /// Get the total notification count.
    fn notification_count(&self) -> Result<usize, ListNotificationsError>;

    fn repo_group(
        &self,
        params: RepoGroupParams,
    ) -> Result<Vec<(identity::RepoId, RepoGroup)>, ListNotificationsError>;
}
