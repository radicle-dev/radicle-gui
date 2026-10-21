use std::collections::BTreeMap;

use serde_json::{json, Value};

use radicle::cob;
use radicle::cob::{issue, patch};
use radicle::identity;
use radicle::node::AliasStore;
use radicle::storage::{git, refs, RemoteRepository};

use super::thread;
use super::{edit, reactions, Author};

pub(crate) struct Issue<'a>(&'a issue::Issue);

impl<'a> Issue<'a> {
    pub fn new(issue: &'a issue::Issue) -> Self {
        Self(issue)
    }

    pub fn as_json(&self, id: issue::IssueId, aliases: &impl AliasStore) -> Value {
        json!({
            "id": id.to_string(),
            "author": Author::new(self.0.author().id()).as_json(aliases),
            "title": self.0.title(),
            "state": self.0.state(),
            "assignees": self.0.assignees().map(|assignee|
                Author::new(assignee).as_json(aliases)
            ).collect::<Vec<_>>(),
            "discussion": self.0.comments().map(|(id, c)|
                thread::Comment::Issue(c).as_json(id, aliases)
            ).collect::<Vec<_>>(),
            "labels": self.0.labels().collect::<Vec<_>>(),
        })
    }
}

pub(crate) struct Patch<'a>(&'a patch::Patch);

impl<'a> Patch<'a> {
    pub fn new(patch: &'a patch::Patch) -> Self {
        Self(patch)
    }

    pub fn as_json(
        &self,
        id: patch::PatchId,
        repo: &git::Repository,
        aliases: &impl AliasStore,
    ) -> Value {
        json!({
            "id": id.to_string(),
            "author": Author::new(self.0.author().id()).as_json(aliases),
            "title": self.0.title(),
            "state": self.0.state(),
            "target": self.0.target(),
            "labels": self.0.labels().collect::<Vec<_>>(),
            "merges": self.0.merges().map(|(nid, m)| json!({
                "author": Author::new(&identity::Did::from(nid)).as_json(aliases),
                "commit": m.commit,
                "timestamp": m.timestamp.as_secs(),
                "revision": m.revision,
            })).collect::<Vec<_>>(),
            "assignees": self.0.assignees().map(|assignee|
                Author::new(&assignee).as_json(aliases)
            ).collect::<Vec<_>>(),
            "revisions": self.0.revisions().map(|(id, rev)|
                Revision::new(rev).as_json(id, repo, aliases)
            ).collect::<Vec<_>>(),
        })
    }
}

pub(crate) struct Revision<'a>(&'a patch::Revision);

impl<'a> Revision<'a> {
    pub fn new(revision: &'a patch::Revision) -> Self {
        Self(revision)
    }

    pub fn as_json(
        &self,
        id: patch::RevisionId,
        repo: &git::Repository,
        aliases: &impl AliasStore,
    ) -> Value {
        let reactions = self
            .0
            .reactions()
            .iter()
            .flat_map(|(location, reaction)| {
                reactions(
                    reaction.iter().fold(
                        BTreeMap::new(),
                        |mut acc: BTreeMap<&cob::Reaction, Vec<_>>, (author, emoji)| {
                            acc.entry(emoji).or_default().push(author);
                            acc
                        },
                    ),
                    location.as_ref(),
                    aliases,
                )
            })
            .collect::<Vec<_>>();
        let refs = get_refs(repo, self.0.author().id(), &self.0.head()).unwrap_or_default();

        json!({
            "id": id,
            "author": Author::new(self.0.author().id()).as_json(aliases),
            "description": self.0.description(),
            "edits": self.0.edits().map(|e| edit(e, aliases)).collect::<Vec<_>>(),
            "reactions": reactions,
            "base": self.0.base(),
            "oid": self.0.head(),
            "refs": refs,
            "discussions": self.0.discussion().comments().map(|(id, c)|
                thread::Comment::Patch(c).as_json(id, aliases)
            ).collect::<Vec<_>>(),
            "timestamp": self.0.timestamp().as_secs(),
            "reviews": self.0.reviews().map(|(_, r)|
                Review::new(r).as_json(aliases)
            ).collect::<Vec<_>>(),
        })
    }
}

pub(crate) struct Review<'a>(&'a patch::Review);

impl<'a> Review<'a> {
    pub fn new(review: &'a patch::Review) -> Self {
        Self(review)
    }

    pub fn as_json(&self, aliases: &impl AliasStore) -> Value {
        json!({
            "id": self.0.id(),
            "author": Author::new(self.0.author().id()).as_json(aliases),
            "verdict": self.0.verdict(),
            "summary": self.0.summary(),
            "comments": self.0.comments().map(|(id, c)|
                thread::Comment::Patch(c).as_json(id, aliases)
            ).collect::<Vec<_>>(),
            "timestamp": self.0.timestamp().as_secs(),
        })
    }
}

fn get_refs(
    repo: &git::Repository,
    id: &cob::ActorId,
    head: &radicle::git::Oid,
) -> Result<Vec<radicle::git::fmt::RefString>, refs::Error> {
    let remote = repo.remote(id)?;
    let refs = remote
        .refs
        .iter()
        .filter_map(|(name, o)| {
            if o == head {
                Some(name.to_owned())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    Ok(refs)
}
