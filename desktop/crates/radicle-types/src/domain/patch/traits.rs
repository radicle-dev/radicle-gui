use radicle::identity;
use radicle::node::AliasStore;
use radicle::patch;
use radicle::patch::Patch;
use radicle::patch::PatchId;

use crate::cobs;
use crate::domain::patch::models;

pub trait PatchStorage {
    fn list(
        &self,
        rid: identity::RepoId,
    ) -> Result<impl Iterator<Item = (PatchId, Patch)>, models::patch::ListPatchesError>;

    fn list_by_status(
        &self,
        rid: identity::RepoId,
        status: patch::Status,
    ) -> Result<impl Iterator<Item = (PatchId, Patch)>, models::patch::ListPatchesError>;

    fn counts(
        &self,
        rid: identity::RepoId,
    ) -> Result<models::patch::PatchCounts, models::patch::CountsError>;
}

pub trait PatchService {
    fn list(
        &self,
        rid: identity::RepoId,
    ) -> Result<impl Iterator<Item = (PatchId, Patch)>, models::patch::ListPatchesError>;

    fn list_by_status(
        &self,
        rid: identity::RepoId,
        status: patch::Status,
    ) -> Result<impl Iterator<Item = (PatchId, Patch)>, models::patch::ListPatchesError>;

    fn counts(
        &self,
        rid: identity::RepoId,
    ) -> Result<models::patch::PatchCounts, models::patch::CountsError>;

    /// One page of patch summaries, shared by all drivers so pagination
    /// behaves identically everywhere. Rows are consumed lazily: with `take`
    /// set, patches beyond the requested page are never deserialized.
    /// Without `take` the full list is returned and `skip` is ignored.
    fn list_paginated(
        &self,
        rid: identity::RepoId,
        status: Option<cobs::query::PatchStatus>,
        skip: Option<usize>,
        take: Option<usize>,
        doc: &identity::Doc,
        aliases: &impl AliasStore,
    ) -> Result<cobs::PaginatedQuery<Vec<models::patch::Patch>>, models::patch::ListPatchesError>
    {
        let patches: Box<dyn Iterator<Item = (PatchId, Patch)> + '_> = match status {
            None => Box::new(self.list(rid)?),
            Some(status) => Box::new(self.list_by_status(rid, status.into())?),
        };
        let summary =
            |(id, patch): (PatchId, Patch)| models::patch::Patch::new(id, &patch, doc, aliases);

        match take {
            None => Ok(cobs::PaginatedQuery {
                cursor: 0,
                more: false,
                content: patches.map(summary).collect::<Vec<_>>(),
            }),
            Some(take) => {
                let cursor = skip.unwrap_or(0);
                let mut content = patches
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
