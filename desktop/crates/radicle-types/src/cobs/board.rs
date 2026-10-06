use radicle::cob::{ObjectId, TypeName};
use radicle::identity::RepoId;
use radicle::node::AliasStore;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::cobs::Author;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/board/")]
pub struct Card {
    #[ts(as = "String")]
    pub rid: RepoId,
    #[ts(as = "String")]
    pub type_name: TypeName,
    #[ts(as = "String")]
    pub oid: ObjectId,
}

impl From<Card> for radicle_board::Card {
    fn from(card: Card) -> Self {
        Self {
            rid: card.rid,
            type_name: card.type_name,
            oid: card.oid,
        }
    }
}

impl From<&radicle_board::Card> for Card {
    fn from(card: &radicle_board::Card) -> Self {
        Self {
            rid: card.rid,
            type_name: card.type_name.clone(),
            oid: card.oid,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/board/")]
pub enum Closes {
    Solved,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/board/")]
pub struct Column {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub closes: Option<Closes>,
}

impl From<Column> for radicle_board::Column {
    fn from(column: Column) -> Self {
        Self {
            id: column.id,
            name: column.name,
            closes: column.closes.map(|closes| match closes {
                Closes::Solved => radicle_board::Closes::Solved,
                Closes::Other => radicle_board::Closes::Other,
            }),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/board/")]
pub struct Placement {
    pub card: Card,
    pub column: String,
    pub position: String,
    pub moved_by: Author,
    #[ts(type = "number")]
    pub moved_at: radicle::cob::Timestamp,
}

#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/board/")]
pub struct Board {
    #[ts(as = "String")]
    pub id: ObjectId,
    pub name: String,
    #[ts(type = "number")]
    pub created_at: radicle::cob::Timestamp,
    pub columns: Vec<Column>,
    pub cards: Vec<Placement>,
}

impl Board {
    pub fn new(id: ObjectId, board: &radicle_board::Board, aliases: &impl AliasStore) -> Self {
        Self {
            id,
            name: board.name().to_string(),
            created_at: board.created_at(),
            columns: board
                .columns()
                .iter()
                .map(|column| Column {
                    id: column.id.clone(),
                    name: column.name.clone(),
                    closes: column.closes.map(|closes| match closes {
                        radicle_board::Closes::Solved => Closes::Solved,
                        radicle_board::Closes::Other => Closes::Other,
                    }),
                })
                .collect(),
            cards: board
                .cards()
                .into_iter()
                .map(|(card, placement)| Placement {
                    card: card.into(),
                    column: placement.column.clone(),
                    position: placement.position.clone(),
                    moved_by: Author::new(&placement.moved_by.into(), aliases),
                    moved_at: placement.moved_at,
                })
                .collect(),
        }
    }
}

/// The issues a patch mentions by id in its title or description.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/board/")]
pub struct PatchLink {
    #[ts(as = "String")]
    pub patch: ObjectId,
    #[ts(as = "Vec<String>")]
    pub issues: Vec<ObjectId>,
}

/// Issue ids mentioned in `text`, in full or as a prefix of at least seven
/// hex digits that matches exactly one issue.
pub fn mentioned_issues(text: &str, issues: &[ObjectId]) -> Vec<ObjectId> {
    let mut found = Vec::new();
    for token in text.split(|c: char| !c.is_ascii_hexdigit()) {
        if token.len() < 7 || token.len() > 40 {
            continue;
        }
        let token = token.to_ascii_lowercase();
        let mut matches = issues
            .iter()
            .filter(|id| id.to_string().starts_with(&token));
        if let (Some(id), None) = (matches.next(), matches.next())
            && !found.contains(id)
        {
            found.push(*id);
        }
    }
    found
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::str::FromStr;

    use radicle::cob::ObjectId;

    use super::mentioned_issues;

    fn id(hex: &str) -> ObjectId {
        ObjectId::from_str(hex).unwrap()
    }

    #[test]
    fn finds_full_and_short_mentions() {
        let a = id("9c07f59c0a7e4b1f3d2e6a8b5c4d3e2f1a0b9c8d");
        let b = id("12e0648a7e4b1f3d2e6a8b5c4d3e2f1a0b9c8d7e");
        let issues = [a, b];

        assert_eq!(
            mentioned_issues(
                "Fixes 9c07f59 and rad:z3/cob/xyz.radicle.issue/12e0648a7e4b1f3d2e6a8b5c4d3e2f1a0b9c8d7e",
                &issues
            ),
            vec![a, b]
        );
        assert_eq!(mentioned_issues("Closes #9C07F59C", &issues), vec![a]);
    }

    #[test]
    fn ignores_short_and_ambiguous_tokens() {
        let a = id("9c07f59c0a7e4b1f3d2e6a8b5c4d3e2f1a0b9c8d");
        let b = id("9c07f59d0a7e4b1f3d2e6a8b5c4d3e2f1a0b9c8d");
        let issues = [a, b];

        assert!(mentioned_issues("See 9c07f5", &issues).is_empty());
        assert!(mentioned_issues("See 9c07f59", &issues).is_empty());
        assert_eq!(mentioned_issues("See 9c07f59d", &issues), vec![b]);
        assert!(mentioned_issues("cafebabe", &issues).is_empty());
    }
}
