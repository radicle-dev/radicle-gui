use radicle::identity;
use radicle::patch;
use radicle::patch::Patch;
use radicle::patch::PatchId;

use crate::domain::patch::traits::{PatchService, PatchStorage};

use super::models::patch::PatchCounts;

#[derive(Debug, Clone)]
pub struct Service<I>
where
    I: PatchStorage,
{
    patches: I,
}

impl<I> Service<I>
where
    I: PatchStorage,
{
    pub fn new(patches: I) -> Self {
        Self { patches }
    }
}

impl<I> PatchService for Service<I>
where
    I: PatchStorage,
{
    fn list(
        &self,
        rid: identity::RepoId,
    ) -> Result<impl Iterator<Item = (PatchId, Patch)>, super::models::patch::ListPatchesError>
    {
        self.patches.list(rid)
    }

    fn list_by_status(
        &self,
        rid: identity::RepoId,
        status: patch::Status,
    ) -> Result<impl Iterator<Item = (PatchId, Patch)>, super::models::patch::ListPatchesError>
    {
        self.patches.list_by_status(rid, status)
    }

    fn counts(
        &self,
        rid: identity::RepoId,
    ) -> Result<PatchCounts, super::models::patch::CountsError> {
        self.patches.counts(rid)
    }
}
