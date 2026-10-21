use std::collections::BTreeMap;

use serde_json::{json, Value};

use radicle::cob;
use radicle::identity;
use radicle::node::AliasStore;

pub(crate) mod cobs;
pub(crate) mod commit;
pub(crate) mod diff;
pub(crate) mod thread;

/// Returns JSON for a `reaction`.
pub fn reactions(
    reactions: BTreeMap<&cob::Reaction, Vec<&cob::ActorId>>,
    location: Option<&cob::CodeLocation>,
    aliases: &impl AliasStore,
) -> Vec<Value> {
    reactions
        .into_iter()
        .map(|(emoji, authors)| {
            let authors = authors
                .into_iter()
                .map(|a| Author::new(&a.into()).as_json(aliases))
                .collect::<Vec<_>>();

            location.map_or(
                json!({
                  "emoji": emoji,
                  "authors": authors,
                }),
                |loc| {
                    json!({
                        "location": diff::CodeLocation::new(loc).as_json(),
                        "emoji": emoji,
                        "authors": authors,
                    })
                },
            )
        })
        .collect::<Vec<_>>()
}

/// Returns JSON for an `Edit`.
pub fn embeds(embeds: &[cob::Embed<cob::Uri>]) -> Vec<Value> {
    embeds
        .iter()
        .map(|e| {
            json!({
                "name": e.name,
                "content": e.content,
            })
        })
        .collect::<Vec<_>>()
}

/// Returns JSON for an `Edit`.
pub fn edit(edit: &cob::thread::Edit, aliases: &impl AliasStore) -> Value {
    json!({
        "author": Author::new(&edit.author.into()).as_json(aliases),
        "body": edit.body,
        "timestamp": edit.timestamp.as_secs(),
        "embeds": embeds(&edit.embeds)
    })
}

pub(crate) struct Author<'a>(&'a identity::Did);

impl<'a> Author<'a> {
    pub fn new(did: &'a identity::Did) -> Self {
        Self(did)
    }

    pub fn as_json(&self, aliases: &impl AliasStore) -> Value {
        aliases.alias(self.0).map_or(
            json!({ "id": self.0 }),
            |alias| json!({ "id": self.0, "alias": alias, }),
        )
    }
}
