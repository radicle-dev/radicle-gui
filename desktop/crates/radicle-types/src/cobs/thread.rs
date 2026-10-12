use serde::{Deserialize, Serialize};
use ts_rs::TS;

use radicle::node::AliasStore;
use radicle::{cob, git, identity};

use crate::cobs;
use crate::domain::patch::models;

#[derive(TS, Serialize, Deserialize)]
#[ts(export)]
#[ts(export_to = "cob/thread/")]
#[serde(rename_all = "camelCase")]
pub struct CreateReviewComment {
    #[ts(as = "String")]
    pub review_id: cob::patch::ReviewId,
    pub body: String,
    #[ts(as = "Option<String>", optional)]
    pub reply_to: Option<cob::thread::CommentId>,
    #[ts(as = "Option<CodeLocation>", optional)]
    pub location: Option<CodeLocation>,
    #[ts(as = "Option<_>", optional)]
    pub embeds: Vec<Embed>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/thread/")]
pub struct Thread<T = cobs::Never> {
    pub root: Comment<T>,
    pub replies: Vec<Comment<T>>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/thread/")]
pub struct Comment<T = cobs::Never> {
    #[ts(as = "String")]
    id: cob::thread::CommentId,
    author: cobs::Author,
    edits: Vec<models::patch::Edit>,
    reactions: Vec<cobs::thread::Reaction>,
    #[ts(as = "Option<String>")]
    reply_to: Option<cob::thread::CommentId>,
    location: Option<T>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<_>", optional)]
    embeds: Vec<Embed>,
    resolved: bool,
}

impl Comment<CodeLocation> {
    pub fn new(
        id: cob::thread::CommentId,
        comment: cob::thread::Comment<cob::common::CodeLocation>,
        aliases: &impl AliasStore,
    ) -> Self {
        Self {
            id,
            author: cobs::Author::new(&comment.author().into(), aliases),
            edits: comment
                .edits()
                .map(|e| models::patch::Edit::new(e, aliases))
                .collect::<Vec<_>>(),
            reactions: comment
                .reactions()
                .into_iter()
                .map(|(reaction, authors)| {
                    cobs::thread::Reaction::new(
                        *reaction,
                        authors.into_iter().map(Into::into).collect(),
                        None,
                        aliases,
                    )
                })
                .collect::<Vec<_>>(),
            reply_to: comment.reply_to(),
            location: comment.location().map(|l| CodeLocation::new(l.clone())),
            embeds: comment
                .embeds()
                .iter()
                .cloned()
                .map(|e| e.into())
                .collect::<Vec<_>>(),
            resolved: comment.is_resolved(),
        }
    }
}

impl Comment<cobs::Never> {
    pub fn new(
        id: cob::thread::CommentId,
        comment: cob::thread::Comment,
        aliases: &impl AliasStore,
    ) -> Self {
        Self {
            id,
            author: cobs::Author::new(&comment.author().into(), aliases),
            edits: comment
                .edits()
                .map(|e| models::patch::Edit::new(e, aliases))
                .collect::<Vec<_>>(),
            reactions: comment
                .reactions()
                .into_iter()
                .map(|(reaction, authors)| {
                    cobs::thread::Reaction::new(
                        *reaction,
                        authors.into_iter().map(Into::into).collect::<Vec<_>>(),
                        None,
                        aliases,
                    )
                })
                .collect::<Vec<_>>(),
            reply_to: comment.reply_to(),
            location: None,
            embeds: comment
                .embeds()
                .iter()
                .cloned()
                .map(|e| e.into())
                .collect::<Vec<_>>(),
            resolved: comment.is_resolved(),
        }
    }
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/")]
pub struct Reaction {
    #[ts(as = "String")]
    emoji: cob::Reaction,
    authors: Vec<cobs::Author>,
    #[ts(optional)]
    location: Option<CodeLocation>,
}

impl Reaction {
    pub fn new(
        emoji: cob::Reaction,
        authors: Vec<identity::Did>,
        location: Option<CodeLocation>,
        aliases: &impl AliasStore,
    ) -> Self {
        Self {
            emoji,
            authors: authors
                .into_iter()
                .map(|did| cobs::Author::new(&did, aliases))
                .collect::<Vec<_>>(),
            location,
        }
    }
}

#[derive(Clone, TS, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/thread/")]
pub struct NewIssueComment {
    #[ts(as = "String")]
    pub id: git::Oid,
    pub body: String,
    #[serde(default)]
    #[ts(as = "Option<String>", optional)]
    pub reply_to: Option<cob::thread::CommentId>,
    #[serde(default)]
    #[ts(as = "Option<_>", optional)]
    pub embeds: Vec<Embed>,
}

#[derive(Clone, TS, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/thread/")]
pub struct NewPatchComment {
    #[ts(as = "String")]
    pub id: git::Oid,
    #[ts(as = "String")]
    pub revision: git::Oid,
    pub body: String,
    #[serde(default)]
    #[ts(as = "Option<String>", optional)]
    pub reply_to: Option<cob::thread::CommentId>,
    #[serde(default)]
    #[ts(optional)]
    pub location: Option<CodeLocation>,
    #[serde(default)]
    #[ts(as = "Option<_>", optional)]
    pub embeds: Vec<Embed>,
}

#[derive(Debug, Clone, TS, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/thread/")]
pub struct CodeLocation {
    #[ts(as = "String")]
    commit: git::Oid,
    path: std::path::PathBuf,
    old: Option<CodeRange>,
    new: Option<CodeRange>,
}

impl From<cob::CodeLocation> for CodeLocation {
    fn from(val: cob::CodeLocation) -> Self {
        Self {
            commit: val.commit,
            path: val.path,
            old: val.old.map(|o| o.into()),
            new: val.new.map(|o| o.into()),
        }
    }
}

impl CodeLocation {
    pub fn new(location: cob::common::CodeLocation) -> Self {
        Self {
            commit: location.commit,
            path: location.path,
            old: location.old.map(|l| l.into()),
            new: location.new.map(|l| l.into()),
        }
    }
}

impl From<CodeLocation> for cob::CodeLocation {
    fn from(val: CodeLocation) -> Self {
        Self {
            commit: val.commit,
            path: val.path,
            old: val.old.map(|o| o.into()),
            new: val.new.map(|o| o.into()),
        }
    }
}

#[derive(Debug, Clone, TS, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
#[ts(export)]
#[ts(export_to = "cob/thread/")]
pub enum CodeRange {
    Lines {
        #[ts(type = "{ start: number, end: number }")]
        range: std::ops::Range<usize>,
    },
    Chars {
        line: usize,
        #[ts(type = "{ start: number, end: number }")]
        range: std::ops::Range<usize>,
    },
}

impl From<cob::CodeRange> for CodeRange {
    fn from(val: cob::CodeRange) -> Self {
        match val {
            cob::CodeRange::Chars { line, range } => Self::Chars { line, range },
            cob::CodeRange::Lines { range } => Self::Lines { range },
        }
    }
}

impl From<CodeRange> for cob::CodeRange {
    fn from(val: CodeRange) -> Self {
        match val {
            CodeRange::Chars { line, range } => Self::Chars { line, range },
            CodeRange::Lines { range } => Self::Lines { range },
        }
    }
}

#[derive(Debug, TS, Clone, Deserialize, Serialize)]
#[ts(export)]
#[ts(export_to = "cob/thread/")]
pub struct Embed {
    name: String,
    #[ts(as = "String")]
    content: cob::Uri,
}

impl From<cob::Embed<cob::Uri>> for Embed {
    fn from(value: cob::Embed<cob::Uri>) -> Self {
        Self {
            name: value.name,
            content: value.content,
        }
    }
}

impl From<Embed> for cob::Embed<cob::Uri> {
    fn from(value: Embed) -> Self {
        Self {
            name: value.name,
            content: value.content,
        }
    }
}
