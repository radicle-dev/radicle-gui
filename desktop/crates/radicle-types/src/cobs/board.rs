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

/// A card placed in `column` at `position`, a key from
/// `radicle_board::position`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/board/")]
pub struct CardMove {
    pub card: Card,
    pub column: String,
    pub position: String,
}

/// A board after a batch of changes, and the cards whose changes weren't
/// made because we aren't allowed to make them.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/board/")]
pub struct BoardUpdate {
    pub board: Board,
    pub rejected: Vec<Card>,
}

/// The issues a patch links to with a keyword and a full reference in its
/// title or description.
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

const LINK_KEYWORDS: [&str; 6] = ["fixes", "fix", "closes", "close", "resolves", "resolve"];

/// Issues in the repository `rid` that `text` links to: a keyword such as
/// `Fixes`, optionally followed by a colon, and then the issue's full
/// `rad:<rid>/cob/xyz.radicle.issue/<oid>` reference, bare or as the target of
/// a Markdown link. References to other repositories and bare ids don't link.
pub fn linked_issues(text: &str, rid: RepoId) -> Vec<ObjectId> {
    let mut found = Vec::new();
    let mut rest = text;
    while let Some((word, after)) = next_word(rest) {
        rest = after;
        let keyword = word.strip_suffix(':').unwrap_or(word);
        if !LINK_KEYWORDS
            .iter()
            .any(|k| keyword.eq_ignore_ascii_case(k))
        {
            continue;
        }
        let after = after.trim_start();
        let reference = match after.strip_prefix('[') {
            Some(link) => link
                .split_once("](")
                .and_then(|(_, target)| target.split_once(')'))
                .map(|(target, _)| target),
            None => after.split_whitespace().next(),
        };
        if let Some(id) = reference.and_then(|r| issue_reference(r, rid))
            && !found.contains(&id)
        {
            found.push(id);
        }
    }
    found
}

fn next_word(text: &str) -> Option<(&str, &str)> {
    let text = text.trim_start();
    if text.is_empty() {
        return None;
    }
    let end = text.find(char::is_whitespace).unwrap_or(text.len());
    Some(text.split_at(end))
}

fn issue_reference(reference: &str, rid: RepoId) -> Option<ObjectId> {
    let reference = reference.trim_end_matches(['.', ',', ';', ':', ')', '!', '?']);
    let (repo, rest) = reference.split_once("/cob/")?;
    if repo.parse::<RepoId>().ok()? != rid {
        return None;
    }
    let oid = rest.strip_prefix("xyz.radicle.issue/")?;
    if oid.len() != 40 || !oid.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    oid.parse().ok()
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::str::FromStr;

    use radicle::cob::ObjectId;
    use radicle::identity::RepoId;

    use super::linked_issues;

    const RID: &str = "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5";
    const OTHER: &str = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
    const A: &str = "9c07f59c0a7e4b1f3d2e6a8b5c4d3e2f1a0b9c8d";
    const B: &str = "12e0648a7e4b1f3d2e6a8b5c4d3e2f1a0b9c8d7e";

    fn id(hex: &str) -> ObjectId {
        ObjectId::from_str(hex).unwrap()
    }

    fn rid() -> RepoId {
        RID.parse().unwrap()
    }

    fn reference(rid: &str, oid: &str) -> String {
        format!("{rid}/cob/xyz.radicle.issue/{oid}")
    }

    #[test]
    fn keywords_link_full_references() {
        let text = format!(
            "Fixes {}\nIt also closes: {}, and FIX {}.",
            reference(RID, A),
            reference(RID, B),
            reference(RID, A)
        );
        assert_eq!(linked_issues(&text, rid()), vec![id(A), id(B)]);
        for keyword in ["Resolves", "resolve", "Close", "closes:"] {
            let text = format!("{keyword} {}", reference(RID, A));
            assert_eq!(linked_issues(&text, rid()), vec![id(A)], "{keyword}");
        }
    }

    #[test]
    fn references_need_a_keyword_right_before_them() {
        assert!(linked_issues(&format!("See {}", reference(RID, A)), rid()).is_empty());
        assert!(
            linked_issues(&format!("Fixes the bug in {}", reference(RID, A)), rid()).is_empty()
        );
        assert!(linked_issues(&format!("{} fixes", reference(RID, A)), rid()).is_empty());
    }

    #[test]
    fn other_repositories_bare_ids_and_other_types_do_not_link() {
        assert!(linked_issues(&format!("Fixes {}", reference(OTHER, A)), rid()).is_empty());
        assert!(linked_issues(&format!("Fixes {A}"), rid()).is_empty());
        assert!(linked_issues(&format!("Fixes {}", &A[..7]), rid()).is_empty());
        assert!(linked_issues(&format!("Fixes {RID}/cob/xyz.radicle.patch/{A}"), rid()).is_empty());
        assert!(
            linked_issues(
                &format!("Fixes {RID}/cob/xyz.radicle.issue/{}", &A[..39]),
                rid()
            )
            .is_empty()
        );
        assert!(linked_issues("Fixes", rid()).is_empty());
    }

    #[test]
    fn markdown_links_link_by_their_target() {
        let text = format!(
            "Closes: [Attachments]({}).\nFixes [the flaky upload test]({})",
            reference(RID, A),
            reference(RID, B)
        );
        assert_eq!(linked_issues(&text, rid()), vec![id(A), id(B)]);
    }

    #[test]
    fn markdown_links_follow_the_same_rules() {
        let other = format!("Fixes [Attachments]({})", reference(OTHER, A));
        assert!(linked_issues(&other, rid()).is_empty());
        let short = format!(
            "Fixes [Attachments]({RID}/cob/xyz.radicle.issue/{})",
            &A[..7]
        );
        assert!(linked_issues(&short, rid()).is_empty());
        let unclosed = format!("Fixes [Attachments]({}", reference(RID, A));
        assert!(linked_issues(&unclosed, rid()).is_empty());
        let without_keyword = format!("See [Attachments]({})", reference(RID, A));
        assert!(linked_issues(&without_keyword, rid()).is_empty());
    }
}
