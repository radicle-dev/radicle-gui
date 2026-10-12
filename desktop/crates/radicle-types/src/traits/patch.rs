use std::collections::BTreeSet;

use radicle::cob::Title;
use radicle::node::Handle;
use radicle::patch::cache::Patches as _;
use radicle::storage::{ReadRepository as _, ReadStorage};
use radicle::{Node, cob, git, identity};

use crate::cobs;
use crate::domain::patch::models;
use crate::error::Error;
use crate::traits::Profile;

pub trait Patches: Profile {
    fn get_patch(
        &self,
        rid: identity::RepoId,
        id: git::Oid,
    ) -> Result<Option<models::patch::Patch>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let patches = profile.patches(&repo)?;
        let patch = patches.get(&id.into())?;
        let aliases = &profile.aliases();
        let doc = repo.identity_doc()?;
        let patches =
            patch.map(|patch| models::patch::Patch::new(id.into(), &patch, &doc, aliases));

        Ok::<_, Error>(patches)
    }

    fn revisions_by_patch(
        &self,
        rid: identity::RepoId,
        id: git::Oid,
    ) -> Result<Option<Vec<models::patch::Revision>>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let patches = profile.patches(&repo)?;
        let revisions = patches.get(&id.into())?.map(|patch| {
            let aliases = &profile.aliases();

            patch
                .revisions()
                .map(|(_, r)| models::patch::Revision::new(r.clone(), aliases))
                .collect::<Vec<_>>()
        });

        Ok::<_, Error>(revisions)
    }
}

pub trait PatchesMut: Profile {
    fn rebuild_patch_cache(
        &self,
        rid: identity::RepoId,
        on_event: impl Fn(cobs::CacheEvent) -> Result<(), Error>,
    ) -> Result<(), Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let mut patches = profile.patches_mut(&repo, &signer)?;
        on_event(cobs::CacheEvent::Started { rid })?;
        patches.write_all(|result, progress| {
            match result {
                Ok((id, _)) => {
                    if on_event(cobs::CacheEvent::Progress {
                        rid,
                        oid: **id,
                        current: progress.current(),
                        total: progress.total(),
                    })
                    .is_err()
                    {
                        log::error!("Failed to send progress");
                    }
                }
                Err(err) => log::warn!("Failed to retrieve patch: {err}"),
            };
            std::ops::ControlFlow::Continue(())
        })?;
        on_event(cobs::CacheEvent::Finished { rid })?;

        Ok(())
    }

    /// Publish a review of a revision, together with its code comments.
    fn create_patch_review(
        &self,
        args: models::patch::CreateReviewArgs,
    ) -> Result<cob::patch::ReviewId, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(args.rid)?;
        let signer = profile.signer()?;
        let mut patches = profile.patches_mut(&repo, &signer)?;
        let patch_id = match patches.find_by_revision(&args.revision)? {
            Some(found) => found.id,
            None => return Err(cob::patch::Error::RevisionNotFound(args.revision).into()),
        };
        let mut patch = patches.get_mut(&patch_id)?;
        // The protocol keeps one review per author per revision: a second
        // `Review` action is written to the object and then dropped on apply,
        // leaving a review id that resolves to nothing. Publishing through it
        // would either fail on the first comment or, for a review with none,
        // report success while storing nothing at all.
        if patch
            .revision(&args.revision)
            .is_some_and(|rev| rev.review_by(&profile.public_key).is_some())
        {
            return Err(Error::ReviewExists);
        }
        let review_id = patch.review(
            args.revision,
            args.verdict.map(Into::into),
            args.summary,
            args.labels,
        )?;

        for comment in args.comments {
            patch.review_comment(
                review_id,
                comment.body,
                comment.location.map(Into::into),
                None,
                vec![],
            )?;
        }

        Ok(review_id)
    }

    fn edit_patch(
        &self,
        rid: identity::RepoId,
        cob_id: git::Oid,
        action: models::patch::Action,
        opts: cobs::CobOptions,
    ) -> Result<models::patch::Patch, Error> {
        let profile = self.profile();
        let mut node = Node::new(profile.home().socket_from_env());
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut patches = profile.patches_mut(&repo, &signer)?;
        let mut patch = patches.get_mut(&cob_id.into())?;

        match action {
            models::patch::Action::RevisionEdit {
                revision,
                description,
                embeds,
            } => {
                patch.edit_revision(
                    revision,
                    description,
                    embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                )?;
            }
            models::patch::Action::RevisionCommentRedact { revision, comment } => {
                patch.comment_redact(revision, comment)?;
            }
            models::patch::Action::ReviewCommentRedact { review, comment } => {
                patch.redact_review_comment(review, comment)?;
            }
            models::patch::Action::ReviewCommentReact {
                review,
                comment,
                reaction,
                active,
            } => {
                patch.react_review_comment(review, comment, reaction, active)?;
            }
            models::patch::Action::ReviewCommentResolve { review, comment } => {
                patch.resolve_review_comment(review, comment)?;
            }
            models::patch::Action::ReviewCommentUnresolve { review, comment } => {
                patch.unresolve_review_comment(review, comment)?;
            }
            models::patch::Action::Edit { title, target: _ } => {
                // Honouring the client's target would retarget a patch
                // opened against a non-default branch; `rad patch edit`
                // carries it forward too.
                let target = patch.target().clone();
                patch.edit(Title::try_from(title)?, target)?;
            }
            models::patch::Action::ReviewEdit {
                review,
                summary,
                verdict,
                labels,
                embeds,
            } => {
                patch.review_edit(
                    review,
                    verdict.map(|v| v.into()),
                    summary.unwrap_or_default(),
                    labels,
                    embeds
                        .unwrap_or_default()
                        .into_iter()
                        .map(Into::into)
                        .collect::<Vec<_>>(),
                )?;
            }
            models::patch::Action::ReviewReact {
                review,
                reaction,
                active,
            } => {
                patch.review_react(review, reaction, active)?;
            }
            models::patch::Action::Review {
                revision,
                summary,
                verdict,
                labels,
            } => {
                patch.review(revision, verdict.map(|v| v.into()), summary, labels)?;
            }
            models::patch::Action::ReviewRedact { review } => {
                patch.redact_review(review)?;
            }
            models::patch::Action::ReviewComment {
                review,
                body,
                location,
                reply_to,
                embeds,
            } => {
                patch.review_comment(
                    review,
                    body,
                    location.map(|l| l.into()),
                    reply_to,
                    embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                )?;
            }
            models::patch::Action::ReviewCommentEdit {
                review,
                comment,
                body,
                embeds,
            } => {
                patch.edit_review_comment(
                    review,
                    comment,
                    body,
                    embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                )?;
            }
            models::patch::Action::Lifecycle { state } => {
                patch.lifecycle(state)?;
            }
            models::patch::Action::Assign { assignees } => {
                patch.assign(assignees.iter().map(|a| *a.did()).collect::<BTreeSet<_>>())?;
            }
            models::patch::Action::Label { labels } => {
                patch.label(labels)?;
            }
            models::patch::Action::RevisionReact {
                revision,
                reaction,
                location,
                active,
            } => {
                patch.react(revision, reaction, location.map(|l| l.into()), active)?;
            }
            models::patch::Action::RevisionComment {
                revision,
                location,
                body,
                reply_to,
                embeds,
            } => {
                patch.comment(
                    revision,
                    body,
                    reply_to,
                    location.map(|l| l.into()),
                    embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                )?;
            }
            models::patch::Action::RevisionCommentEdit {
                revision,
                comment,
                body,
                embeds,
            } => {
                patch.comment_edit(
                    revision,
                    comment,
                    body,
                    embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                )?;
            }
            models::patch::Action::RevisionCommentReact {
                revision,
                comment,
                reaction,
                active,
            } => {
                patch.comment_react(revision, comment, reaction, active)?;
            }
            models::patch::Action::RevisionRedact { revision } => {
                patch.redact(revision)?;
            }
            models::patch::Action::Merge { .. } => {
                unimplemented!("We don't support merging of patches through the desktop")
            }
            models::patch::Action::Revision { .. } => {
                unimplemented!("We don't support creating new revisions through the desktop")
            }
        }

        if opts.announce()
            && let Err(e) = node.announce_refs_for(rid, [profile.public_key])
        {
            log::error!("Not able to announce changes: {}", e)
        }

        let doc = repo.identity_doc()?;

        Ok::<_, Error>(models::patch::Patch::new(
            *patch.id(),
            &patch,
            &doc,
            &aliases,
        ))
    }

    /// Remove a patch COB. Equivalent to `rad patch delete`.
    ///
    /// Only the COB ref under our own namespace is dropped. On a patch we did
    /// not author we hold no such ref, so this returns `Ok` having deleted
    /// nothing — while still evicting the cache entry, hiding the patch until
    /// the next rebuild. Callers must restrict this to our own patches.
    fn delete_patch(
        &self,
        rid: identity::RepoId,
        cob_id: git::Oid,
        opts: cobs::CobOptions,
    ) -> Result<(), Error> {
        let profile = self.profile();
        let mut node = Node::new(profile.home().socket_from_env());
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;

        // Remove via the cache-backed store so the patch is dropped from both
        // the git refs and the COB cache that listings read from; otherwise the
        // deleted patch keeps showing up in the patch list.
        let mut patches = profile.patches_mut(&repo, &signer)?;
        patches.remove(&cob_id.into())?;
        drop(patches);

        if opts.announce()
            && let Err(e) = node.announce_refs_for(rid, [profile.public_key])
        {
            log::error!("Not able to announce changes: {}", e)
        }

        Ok(())
    }
}
