use radicle::identity;

use crate::domain::contribution::models::contribution::{
    ActivityItem, ContributionDay, ContributionError, RepoContribution,
};
use crate::domain::contribution::traits::{ContributionService, ContributionStorage};

#[derive(Debug, Clone)]
pub struct Service<C>
where
    C: ContributionStorage,
{
    contributions: C,
}

impl<C> Service<C>
where
    C: ContributionStorage,
{
    pub fn new(contributions: C) -> Self {
        Self { contributions }
    }
}

impl<C> ContributionService for Service<C>
where
    C: ContributionStorage,
{
    fn contributions_by_author(
        &self,
        did: identity::Did,
    ) -> Result<Vec<RepoContribution>, ContributionError> {
        self.contributions.contributions_by_author(did)
    }

    fn recent_activity_by_author(
        &self,
        did: identity::Did,
        limit: usize,
    ) -> Result<Vec<ActivityItem>, ContributionError> {
        self.contributions.recent_activity_by_author(did, limit)
    }

    fn contribution_calendar(
        &self,
        did: identity::Did,
        days: u32,
    ) -> Result<Vec<ContributionDay>, ContributionError> {
        self.contributions.contribution_calendar(did, days)
    }
}
