use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::ops::Index;

use radicle::node::AliasStore;
use radicle::patch::Status;
use radicle::prelude::RepoId;
use radicle::profile::Aliases;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use radicle::cob;
use radicle::git;
use radicle::patch;

use crate::cobs;
use crate::cobs::Author;
use crate::cobs::FromRadicleAction;

/// One published review, flattened so the patch list can summarise a patch
/// without loading its revisions.
///
/// There is an entry per review, not per reviewer: the protocol allows one
/// review per author per revision, so the same person appears once for each
/// revision they reviewed. `revision_number` is the reviewed revision's 1-based
/// position in the patch timeline, which together with `revision_ids.len()`
/// tells the UI whether a review still covers the current head.
#[derive(Debug, TS, Serialize)]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
#[serde(rename_all = "camelCase")]
pub struct Reviewer {
    author: cobs::Author,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    verdict: Option<Verdict>,
    #[ts(type = "number")]
    revision_number: usize,
    /// Whether the reviewer is a delegate, so their verdict can be told apart
    /// from a non-delegate's at a glance.
    delegate: bool,
}

#[derive(Debug, TS, Serialize)]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    id: String,
    author: cobs::Author,
    title: String,
    #[ts(as = "String")]
    base: git::Oid,
    #[ts(as = "String")]
    head: git::Oid,
    state: State,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    target_branch: Option<String>,
    assignees: Vec<cobs::Author>,
    #[ts(as = "Vec<String>")]
    labels: Vec<cob::Label>,
    #[ts(type = "number")]
    timestamp: cob::Timestamp,
    #[ts(as = "Vec<String>")]
    revision_ids: Vec<patch::RevisionId>,
    #[ts(type = "number")]
    comment_count: usize,
    reviewers: Vec<Reviewer>,
}

#[derive(Debug, thiserror::Error)]
pub enum ListPatchesError {
    #[error(transparent)]
    Sqlite(#[from] sqlite::Error),

    #[error(transparent)]
    Unknown(#[from] anyhow::Error),
    // to be extended as new error scenarios are introduced
}

impl Patch {
    pub fn new(
        id: patch::PatchId,
        patch: &patch::Patch,
        doc: &radicle::identity::Doc,
        aliases: &impl AliasStore,
    ) -> Self {
        let (_, latest) = patch
            .revisions()
            .next_back()
            .expect("there is always at least one revision");
        // Every review on every revision, so the patch list can render the same
        // summary the patch page does. `revision_number` is what lets the UI
        // tell a review of the current head from one left behind by a later
        // push — see the outdated handling in `reviewSummary`. It follows
        // `patch.revisions()`, the timeline order `revision_ids` also uses.
        let delegates = doc.delegates();
        let reviewers = patch
            .revisions()
            .enumerate()
            .flat_map(|(index, (_, revision))| {
                revision.reviews().map(move |(key, review)| {
                    let did = radicle::identity::Did::from(*key);

                    Reviewer {
                        author: cobs::Author::new(&did, aliases),
                        verdict: review.verdict().map(Into::into),
                        revision_number: index + 1,
                        delegate: delegates.contains(&did),
                    }
                })
            })
            .collect::<Vec<_>>();

        Self {
            id: id.to_string(),
            author: cobs::Author::new(patch.author().id(), aliases),
            title: patch.title().to_string(),
            state: patch.state().clone().into(),
            target_branch: patch
                .merge_target_branch(doc)
                .map(|branch| branch.to_string())
                .ok(),
            base: *latest.base(),
            head: latest.head(),
            assignees: patch
                .assignees()
                .map(|did| cobs::Author::new(&did, aliases))
                .collect::<Vec<_>>(),
            labels: patch.labels().cloned().collect::<Vec<_>>(),
            timestamp: patch.timestamp(),
            revision_ids: patch.revisions().map(|(id, _)| id).collect(),
            // Unlike an issue, a revision's description is a field of its own
            // rather than the root of its discussion thread, so every comment
            // in the thread counts. Review summaries are likewise separate from
            // `Review::comments`, which holds only code comments.
            comment_count: patch
                .revisions()
                .map(|(_, revision)| {
                    let discussion_comments = revision.discussion().comments().count();
                    let review_comments = revision
                        .reviews()
                        .map(|(_, review)| review.comments().count())
                        .sum::<usize>();

                    discussion_comments + review_comments
                })
                .sum(),
            reviewers,
        }
    }

    pub fn timestamp(&self) -> u64 {
        self.timestamp.as_millis()
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", tag = "status")]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
pub enum State {
    Draft,
    Open {
        #[serde(skip_serializing_if = "Vec::is_empty")]
        #[serde(default)]
        #[ts(as = "Option<Vec<(String, String)>>", optional)]
        conflicts: Vec<(patch::RevisionId, git::Oid)>,
    },
    Archived,
    Merged {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        #[ts(as = "String")]
        commit: git::Oid,
    },
}

impl From<State> for patch::State {
    fn from(value: State) -> Self {
        match value {
            State::Archived => Self::Archived,
            State::Draft => Self::Draft,
            State::Merged { revision, commit } => Self::Merged { revision, commit },
            State::Open { conflicts } => Self::Open { conflicts },
        }
    }
}

impl From<patch::State> for State {
    fn from(value: patch::State) -> Self {
        match value {
            patch::State::Archived => Self::Archived,
            patch::State::Draft => Self::Draft,
            patch::State::Merged { revision, commit } => Self::Merged { revision, commit },
            patch::State::Open { conflicts } => Self::Open { conflicts },
        }
    }
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
pub struct Revision {
    #[ts(as = "String")]
    id: patch::RevisionId,
    author: cobs::Author,
    description: Vec<Edit>,
    #[ts(as = "String")]
    base: git::Oid,
    #[ts(as = "String")]
    head: git::Oid,
    #[ts(as = "Option<_>", optional)]
    reviews: Vec<Review>,
    #[ts(type = "number")]
    timestamp: cob::common::Timestamp,
    #[ts(as = "Option<_>", optional)]
    discussion: Vec<cobs::thread::Comment<cobs::thread::CodeLocation>>,
    #[ts(as = "Option<_>", optional)]
    reactions: Vec<cobs::thread::Reaction>,
}

impl Revision {
    pub fn new(value: cob::patch::Revision, aliases: &impl AliasStore) -> Self {
        Self {
            id: value.id(),
            author: cobs::Author::new(value.author().id(), aliases),
            description: value
                .edits()
                .map(|e| Edit::new(e, aliases))
                .collect::<Vec<_>>(),
            base: *value.base(),
            head: value.head(),
            reviews: value
                .reviews()
                .map(|(_, r)| Review::new(r.clone(), aliases))
                .collect::<Vec<_>>(),
            timestamp: value.timestamp(),
            discussion: value
                .discussion()
                .comments()
                .map(|(id, c)| {
                    cobs::thread::Comment::<cobs::thread::CodeLocation>::new(
                        *id,
                        c.clone(),
                        aliases,
                    )
                })
                .collect::<Vec<_>>(),
            reactions: value
                .reactions()
                .iter()
                .flat_map(|(location, reactions)| {
                    let reaction_by_author = reactions.iter().fold(
                        BTreeMap::new(),
                        |mut acc: BTreeMap<&cob::Reaction, Vec<_>>, (author, emoji)| {
                            acc.entry(emoji).or_default().push(author);
                            acc
                        },
                    );
                    reaction_by_author
                        .into_iter()
                        .map(|(emoji, authors)| {
                            cobs::thread::Reaction::new(
                                *emoji,
                                authors.into_iter().map(Into::into).collect::<Vec<_>>(),
                                location
                                    .as_ref()
                                    .map(|l| cobs::thread::CodeLocation::new(l.clone())),
                                aliases,
                            )
                        })
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>(),
        }
    }
}

#[derive(TS, Serialize)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
pub struct Edit {
    pub author: cobs::Author,
    #[ts(type = "number")]
    pub timestamp: cob::common::Timestamp,
    pub body: String,
    #[ts(as = "Option<_>", optional)]
    pub embeds: Vec<cobs::thread::Embed>,
}

impl Edit {
    pub fn new(edit: &cob::thread::Edit, aliases: &impl AliasStore) -> Self {
        Self {
            author: cobs::Author::new(&edit.author.into(), aliases),
            timestamp: edit.timestamp,
            body: edit.body.clone(),
            embeds: edit
                .embeds
                .iter()
                .cloned()
                .map(|e| e.into())
                .collect::<Vec<_>>(),
        }
    }
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
pub struct Review {
    #[ts(as = "String")]
    id: cob::patch::ReviewId,
    author: cobs::Author,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    verdict: Option<Verdict>,
    summary: String,
    comments: Vec<cobs::thread::Comment<cobs::thread::CodeLocation>>,
    #[ts(type = "number")]
    timestamp: cob::common::Timestamp,
    #[ts(as = "Vec<String>")]
    labels: Vec<cob::Label>,
}

impl Review {
    pub fn new(review: cob::patch::Review, aliases: &impl AliasStore) -> Self {
        Self {
            id: review.id(),
            author: cobs::Author::new(&review.author().id, aliases),
            verdict: review.verdict().map(|v| v.into()),
            summary: review.summary().to_string(),
            labels: review.labels().cloned().collect::<Vec<_>>(),
            comments: review
                .comments()
                .map(|(id, c)| {
                    cobs::thread::Comment::<cobs::thread::CodeLocation>::new(
                        *id,
                        c.clone(),
                        aliases,
                    )
                })
                .collect::<Vec<_>>(),
            timestamp: review.timestamp(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
pub enum Verdict {
    Accept,
    Reject,
}

impl From<cob::patch::Verdict> for Verdict {
    fn from(value: cob::patch::Verdict) -> Self {
        match value {
            cob::patch::Verdict::Accept => Self::Accept,
            cob::patch::Verdict::Reject => Self::Reject,
        }
    }
}

impl From<Verdict> for cob::patch::Verdict {
    fn from(value: Verdict) -> Self {
        match value {
            Verdict::Accept => Self::Accept,
            Verdict::Reject => Self::Reject,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
pub enum Action {
    #[serde(rename = "edit")]
    Edit {
        title: String,
        #[ts(type = "\"delegates\" | { branch: string }")]
        target: patch::MergeTarget,
    },
    #[serde(rename = "label")]
    Label {
        #[ts(as = "Vec<String>")]
        labels: BTreeSet<cob::Label>,
    },
    #[serde(rename = "lifecycle")]
    Lifecycle {
        #[ts(type = "{ status: 'draft' | 'open' | 'archived' }")]
        state: patch::Lifecycle,
    },
    #[serde(rename = "assign")]
    Assign { assignees: BTreeSet<cobs::Author> },
    #[serde(rename = "merge")]
    Merge {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        #[ts(as = "String")]
        commit: git::Oid,
    },

    #[serde(rename = "review")]
    Review {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        summary: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        verdict: Option<Verdict>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        #[ts(as = "Option<Vec<String>>", optional)]
        labels: Vec<cob::Label>,
    },
    #[serde(rename = "review.edit")]
    ReviewEdit {
        #[ts(as = "String")]
        review: patch::ReviewId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        summary: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        verdict: Option<Verdict>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        #[ts(as = "Option<Vec<String>>", optional)]
        labels: Vec<cob::Label>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(as = "Option<_>", optional)]
        embeds: Option<Vec<cobs::thread::Embed>>,
    },
    #[serde(rename = "review.redact")]
    ReviewRedact {
        #[ts(as = "String")]
        review: patch::ReviewId,
    },
    #[serde(rename = "review.comment")]
    #[serde(rename_all = "camelCase")]
    ReviewComment {
        #[ts(as = "String")]
        review: patch::ReviewId,
        body: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        location: Option<cobs::thread::CodeLocation>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(as = "Option<String>", optional)]
        reply_to: Option<cob::thread::CommentId>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        #[ts(as = "Option<_>", optional)]
        embeds: Vec<cobs::thread::Embed>,
    },
    #[serde(rename = "review.comment.edit")]
    ReviewCommentEdit {
        #[ts(as = "String")]
        review: patch::ReviewId,
        #[ts(as = "String")]
        comment: cob::EntryId,
        body: String,
        #[ts(as = "Option<_>", optional)]
        embeds: Vec<cobs::thread::Embed>,
    },
    #[serde(rename = "review.comment.redact")]
    ReviewCommentRedact {
        #[ts(as = "String")]
        review: patch::ReviewId,
        #[ts(as = "String")]
        comment: cob::EntryId,
    },
    #[serde(rename = "review.comment.react")]
    ReviewCommentReact {
        #[ts(as = "String")]
        review: patch::ReviewId,
        #[ts(as = "String")]
        comment: cob::EntryId,
        #[ts(as = "String")]
        reaction: cob::Reaction,
        active: bool,
    },
    #[serde(rename = "review.comment.resolve")]
    ReviewCommentResolve {
        #[ts(as = "String")]
        review: patch::ReviewId,
        #[ts(as = "String")]
        comment: cob::EntryId,
    },
    #[serde(rename = "review.comment.unresolve")]
    ReviewCommentUnresolve {
        #[ts(as = "String")]
        review: patch::ReviewId,
        #[ts(as = "String")]
        comment: cob::EntryId,
    },
    #[serde(rename = "review.react")]
    ReviewReact {
        #[ts(as = "String")]
        review: patch::ReviewId,
        #[ts(as = "String")]
        reaction: cob::Reaction,
        active: bool,
    },

    #[serde(rename = "revision")]
    Revision {
        description: String,
        #[ts(as = "String")]
        base: git::Oid,
        #[ts(as = "String")]
        oid: git::Oid,
        #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
        #[ts(as = "Option<BTreeSet<(String, String)>>", optional)]
        resolves: BTreeSet<(cob::EntryId, cob::thread::CommentId)>,
    },
    #[serde(rename = "revision.edit")]
    RevisionEdit {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        description: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        #[ts(as = "Option<_>", optional)]
        embeds: Vec<cobs::thread::Embed>,
    },
    #[serde(rename = "revision.react")]
    RevisionReact {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        location: Option<cobs::thread::CodeLocation>,
        #[ts(as = "String")]
        reaction: cob::Reaction,
        active: bool,
    },
    #[serde(rename = "revision.redact")]
    RevisionRedact {
        #[ts(as = "String")]
        revision: patch::RevisionId,
    },
    #[serde(rename_all = "camelCase")]
    #[serde(rename = "revision.comment")]
    RevisionComment {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        location: Option<cobs::thread::CodeLocation>,
        body: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(as = "Option<String>", optional)]
        reply_to: Option<cob::thread::CommentId>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        #[ts(as = "Option<_>", optional)]
        embeds: Vec<cobs::thread::Embed>,
    },
    #[serde(rename = "revision.comment.edit")]
    RevisionCommentEdit {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        #[ts(as = "String")]
        comment: cob::thread::CommentId,
        body: String,
        #[ts(as = "Option<_>", optional)]
        embeds: Vec<cobs::thread::Embed>,
    },
    #[serde(rename = "revision.comment.redact")]
    RevisionCommentRedact {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        #[ts(as = "String")]
        comment: cob::thread::CommentId,
    },
    #[serde(rename = "revision.comment.react")]
    RevisionCommentReact {
        #[ts(as = "String")]
        revision: patch::RevisionId,
        #[ts(as = "String")]
        comment: cob::thread::CommentId,
        #[ts(as = "String")]
        reaction: cob::Reaction,
        active: bool,
    },
}

impl FromRadicleAction<radicle::patch::Action> for Action {
    fn from_radicle_action(value: radicle::patch::Action, aliases: &Aliases) -> Self {
        match value {
            radicle::patch::Action::ReviewRedact { review } => Self::ReviewRedact { review },
            radicle::patch::Action::RevisionCommentReact {
                revision,
                comment,
                reaction,
                active,
            } => Self::RevisionCommentReact {
                revision,
                comment,
                reaction,
                active,
            },
            radicle::patch::Action::RevisionCommentRedact { revision, comment } => {
                Self::RevisionCommentRedact { revision, comment }
            }
            radicle::patch::Action::RevisionCommentEdit {
                revision,
                comment,
                body,
                embeds,
            } => Self::RevisionCommentEdit {
                revision,
                comment,
                body,
                embeds: embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
            },
            radicle::patch::Action::RevisionComment {
                revision,
                location,
                body,
                reply_to,
                embeds,
            } => Self::RevisionComment {
                revision,
                location: location.map(Into::into),
                body,
                reply_to,
                embeds: embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
            },
            radicle::patch::Action::RevisionRedact { revision } => {
                Self::RevisionRedact { revision }
            }
            radicle::patch::Action::RevisionReact {
                revision,
                location,
                reaction,
                active,
            } => Self::RevisionReact {
                revision,
                location: location.map(Into::into),
                reaction,
                active,
            },
            radicle::patch::Action::RevisionEdit {
                revision,
                description,
                embeds,
            } => Self::RevisionEdit {
                revision,
                description,
                embeds: embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
            },
            radicle::patch::Action::Assign { assignees } => Self::Assign {
                assignees: assignees
                    .iter()
                    .map(|a| Author::new(a, aliases))
                    .collect::<BTreeSet<_>>(),
            },
            radicle::patch::Action::Edit { title, target } => Self::Edit {
                title: title.to_string(),
                target,
            },
            radicle::patch::Action::Label { labels } => Self::Label { labels },
            radicle::patch::Action::Lifecycle { state } => Self::Lifecycle { state },
            radicle::patch::Action::Merge { revision, commit } => Self::Merge { revision, commit },
            radicle::patch::Action::Revision {
                description,
                base,
                oid,
                resolves,
            } => Self::Revision {
                description,
                base,
                oid,
                resolves,
            },

            radicle::patch::Action::Review {
                revision,
                summary,
                verdict,
                labels,
            } => Self::Review {
                revision,
                summary,
                verdict: verdict.map(Into::into),
                labels,
            },
            radicle::patch::Action::ReviewComment {
                review,
                body,
                location,
                reply_to,
                embeds,
            } => Self::ReviewComment {
                review,
                body,
                location: location.map(Into::into),
                reply_to,
                embeds: embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
            },
            radicle::patch::Action::ReviewCommentEdit {
                review,
                comment,
                body,
                embeds,
            } => Self::ReviewCommentEdit {
                review,
                comment,
                body,
                embeds: embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
            },
            radicle::patch::Action::ReviewCommentReact {
                review,
                comment,
                reaction,
                active,
            } => Self::ReviewCommentReact {
                review,
                comment,
                reaction,
                active,
            },
            radicle::patch::Action::ReviewCommentRedact { review, comment } => {
                Self::ReviewCommentRedact { review, comment }
            }
            radicle::patch::Action::ReviewCommentResolve { review, comment } => {
                Self::ReviewCommentResolve { review, comment }
            }
            radicle::patch::Action::ReviewCommentUnresolve { review, comment } => {
                Self::ReviewCommentUnresolve { review, comment }
            }
            radicle::patch::Action::ReviewReact {
                review,
                reaction,
                active,
            } => Self::ReviewReact {
                review,
                reaction,
                active,
            },
            radicle::patch::Action::ReviewEdit(review) => Self::ReviewEdit {
                review: *review.review_id(),
                summary: review.summary().cloned(),
                verdict: review.verdict().cloned().map(Into::into),
                labels: review.labels().to_vec(),
                embeds: review
                    .embeds()
                    .cloned()
                    .map(|s| s.into_iter().map(Into::into).collect::<Vec<_>>()),
            },
        }
    }
}

#[derive(Debug, TS, Deserialize)]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
pub struct CreateReviewArgs {
    #[ts(as = "String")]
    pub rid: RepoId,
    #[ts(as = "String")]
    pub revision: patch::RevisionId,
    pub verdict: Option<Verdict>,
    pub summary: Option<String>,
    #[ts(as = "Vec<String>")]
    pub labels: Vec<cob::Label>,
    #[ts(inline)]
    pub comments: Vec<CreateReviewComment>,
}

#[derive(Debug, TS, Deserialize)]
pub struct CreateReviewComment {
    pub body: String,
    pub location: Option<cobs::thread::CodeLocation>,
}

#[derive(Debug, Default, TS, Serialize)]
#[ts(export)]
#[ts(export_to = "cob/patch/")]
#[serde(rename_all = "camelCase")]
pub struct PatchCounts {
    pub(crate) open: usize,
    pub(crate) draft: usize,
    pub(crate) archived: usize,
    pub(crate) merged: usize,
}

impl Index<Status> for PatchCounts {
    type Output = usize;

    fn index(&self, status: Status) -> &Self::Output {
        match status {
            Status::Draft => &self.draft,
            Status::Open => &self.open,
            Status::Archived => &self.archived,
            Status::Merged => &self.merged,
        }
    }
}

impl PatchCounts {
    pub fn new(open: usize, draft: usize, archived: usize, merged: usize) -> Self {
        Self {
            open,
            draft,
            archived,
            merged,
        }
    }

    pub fn total(&self) -> usize {
        self.open + self.draft + self.archived + self.merged
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CountsError {
    #[error(transparent)]
    Sqlite(#[from] sqlite::Error),

    #[error(transparent)]
    Unknown(#[from] anyhow::Error),
    // to be extended as new error scenarios are introduced
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::collections::HashMap;

    use radicle::cob::cache::NoCache;
    use radicle::cob::store::access::WriteAs;
    use radicle::crypto::SigningKey;
    use radicle::patch::{MergeTarget, Patches};
    use radicle::storage::ReadRepository;
    use radicle::test::setup::NodeWithRepo;

    use super::Patch;

    #[test]
    fn head_follows_latest_revision_by_any_author() {
        let alice = NodeWithRepo::default();
        let bob = SigningKey::mock(23);
        let checkout = alice.repo.checkout();
        let first = checkout.branch_with([("README", b"Hello World!")]);
        let second = checkout.branch_with([("README", b"Hello Radicle!")]);

        let id = Patches::open(&*alice.repo, WriteAs::new(&alice.signer))
            .unwrap()
            .create(
                radicle::cob::Title::new("My patch").unwrap(),
                "",
                MergeTarget::Delegates,
                first.base,
                first.oid,
                &[],
                &mut NoCache,
            )
            .unwrap()
            .id;
        Patches::open(&*alice.repo, WriteAs::new(&bob))
            .unwrap()
            .get_mut(&id, &mut NoCache)
            .unwrap()
            .update("Bob's revision", first.oid, second.oid)
            .unwrap();

        let patch = Patches::open(&*alice.repo, WriteAs::new(&alice.signer))
            .unwrap()
            .get(&id)
            .unwrap()
            .unwrap();
        assert_eq!(*patch.head(), first.oid);

        let doc = alice.repo.identity_doc().unwrap().doc;
        let patch = Patch::new(id, &patch, &doc, &HashMap::new());
        assert_eq!(patch.base, first.oid);
        assert_eq!(patch.head, second.oid);
    }
}
