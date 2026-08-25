use radicle::identity;

use crate::domain::contribution::models::contribution::{
    ActivityItem, ContributionDay, ContributionError, RepoContribution,
};

pub trait ContributionStorage {
    /// Per-repo counts of the patches and issues `did` opened.
    fn contributions_by_author(
        &self,
        did: identity::Did,
    ) -> Result<Vec<RepoContribution>, ContributionError>;

    /// The most recently opened patches and issues by `did`, across every repo
    /// in the cache, newest first.
    fn recent_activity_by_author(
        &self,
        did: identity::Did,
        limit: usize,
    ) -> Result<Vec<ActivityItem>, ContributionError>;

    /// Daily contribution counts over the last `days` days, for the calendar.
    fn contribution_calendar(
        &self,
        did: identity::Did,
        days: u32,
    ) -> Result<Vec<ContributionDay>, ContributionError>;
}

pub trait ContributionService {
    /// Per-repo counts of the patches and issues `did` opened.
    fn contributions_by_author(
        &self,
        did: identity::Did,
    ) -> Result<Vec<RepoContribution>, ContributionError>;

    /// The most recently opened patches and issues by `did`, across every repo
    /// in the cache, newest first.
    fn recent_activity_by_author(
        &self,
        did: identity::Did,
        limit: usize,
    ) -> Result<Vec<ActivityItem>, ContributionError>;

    /// Daily contribution counts over the last `days` days, for the calendar.
    fn contribution_calendar(
        &self,
        did: identity::Did,
        days: u32,
    ) -> Result<Vec<ContributionDay>, ContributionError>;
}
