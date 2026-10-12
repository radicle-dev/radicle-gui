use radicle::cob::identity;
use radicle::identity::DocAt;
use radicle::storage::{ReadRepository, ReadStorage};

use crate::cobs::Author;
use crate::error::Error;
use crate::identity as types;
use crate::traits::Profile;

pub trait Identity: Profile {
    /// The identity document and its revision history, returned whole since
    /// identity histories are short.
    fn identity_by_repo(&self, rid: radicle::identity::RepoId) -> Result<types::Identity, Error> {
        let profile = self.profile();
        let aliases = profile.aliases();
        let repo = profile.storage.repository(rid)?;
        let identity = identity::Identity::load(&repo)?;

        // `refs/rad/id` points at the current revision's commit, as
        // `rad inspect --history` relies on.
        let DocAt {
            doc: current_doc,
            commit: current_commit,
            ..
        } = repo.identity_doc()?;

        let raws = identity
            .revisions()
            .map(|revision| (revision.id, types::raw_doc(&revision.doc)))
            .collect::<std::collections::HashMap<_, _>>();

        // Newest first.
        let revisions = identity
            .revisions()
            .rev()
            .filter_map(|revision| {
                let parent = revision
                    .parent
                    .and_then(|id| identity.revision(&id))
                    .map(|parent| &parent.doc);
                let state = types::State::new(revision.state)?;
                let raw = raws.get(&revision.id)?;

                // Verdicts are cast by the delegates of the parent document and
                // listed sorted, as `rad id show` does. The root revision has
                // no parent: it is accepted on creation and never voted on.
                let mut accepted = revision.accepted().collect::<Vec<_>>();
                accepted.sort();
                let mut rejected = revision.rejected().collect::<Vec<_>>();
                rejected.sort();
                let mut pending = parent
                    .map(|parent| {
                        parent
                            .delegates()
                            .iter()
                            .filter(|did| !accepted.contains(did) && !rejected.contains(did))
                            .cloned()
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                pending.sort();
                let authors = |dids: Vec<radicle::identity::Did>| {
                    dids.iter()
                        .map(|did| Author::new(did, &aliases))
                        .collect::<Vec<_>>()
                };

                Some(types::Revision {
                    id: revision.id,
                    blob: revision.blob,
                    title: revision.title.to_string(),
                    description: revision.description.clone(),
                    state,
                    author: Author::new(&revision.author.id, &aliases),
                    timestamp: revision.timestamp.as_millis(),
                    parent: revision.parent,
                    accepted: authors(accepted),
                    rejected: authors(rejected),
                    pending: authors(pending),
                    majority: parent.map(|parent| parent.majority()),
                    changes: types::changes(parent, &revision.doc, &aliases),
                    diff: types::doc_diff(
                        revision
                            .parent
                            .and_then(|id| raws.get(&id))
                            .map(String::as_str),
                        raw,
                    ),
                    raw: raw.clone(),
                })
            })
            .collect::<Vec<_>>();

        let current = identity
            .revision(&current_commit)
            .filter(|revision| revision.is_accepted())
            .map(|revision| revision.id);

        Ok(types::Identity {
            rid,
            current,
            doc: types::Doc::new(&current_doc, &aliases),
            revisions,
        })
    }
}
