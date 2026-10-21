use serde_json::{json, Value};

use radicle::cob;
use radicle::cob::CodeLocation;
use radicle::git::Oid;
use radicle::node::AliasStore;

use super::{diff, edit, embeds, reactions, Author};

pub(crate) enum Comment<'a> {
    Patch(&'a cob::thread::Comment<CodeLocation>),
    Issue(&'a cob::thread::Comment),
}

impl Comment<'_> {
    pub fn as_json(&self, id: &Oid, aliases: &impl AliasStore) -> Value {
        match self {
            Comment::Issue(c) => json!({
                "id": *id,
                "author": Author::new(&c.author().into()).as_json(aliases),
                "body": c.body(),
                "edits": c.edits().map(|e| edit(e, aliases)).collect::<Vec<_>>(),
                "embeds": embeds(c.embeds()),
                "reactions": reactions(c.reactions(), None, aliases),
                "timestamp": c.timestamp().as_secs(),
                "replyTo": c.reply_to(),
                "resolved": c.is_resolved(),
            }),
            Comment::Patch(c) => json!({
                "id": *id,
                "author": Author::new(&c.author().into()).as_json(aliases),
                "body": c.body(),
                "edits": c.edits().map(|e| edit(e, aliases)).collect::<Vec<_>>(),
                "embeds": embeds(c.embeds()),
                "reactions": reactions(c.reactions(), None, aliases),
                "timestamp": c.timestamp().as_secs(),
                "replyTo": c.reply_to(),
                "location": c.location().map(|l| diff::CodeLocation::new(l).as_json()),
                "resolved": c.is_resolved(),
            }),
        }
    }
}
