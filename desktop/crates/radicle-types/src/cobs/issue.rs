use std::collections::BTreeSet;

use radicle::node::AliasStore;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use radicle::cob;
use radicle::identity;
use radicle::issue;

use crate::cobs;

use super::Author;
use super::FromRadicleAction;

#[derive(TS, Serialize)]
#[ts(export)]
#[ts(export_to = "cob/issue/")]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    id: String,
    author: cobs::Author,
    title: String,
    state: cobs::issue::State,
    assignees: Vec<cobs::Author>,
    // Omitted from list responses, which only need teaser data; populated
    // when fetching a single issue.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    body: Option<cobs::thread::Comment>,
    #[ts(type = "number")]
    comment_count: usize,
    #[ts(as = "Vec<String>")]
    labels: Vec<cob::Label>,
    #[ts(type = "number")]
    timestamp: cob::Timestamp,
}

impl Issue {
    pub fn new(id: &issue::IssueId, issue: &issue::Issue, aliases: &impl AliasStore) -> Self {
        let (root_oid, root_comment) = issue.root();

        Self {
            body: Some(cobs::thread::Comment::<cobs::Never>::new(
                *root_oid,
                root_comment.clone(),
                aliases,
            )),
            ..Self::summary(id, issue, aliases)
        }
    }

    /// Teaser variant for list responses; omits the issue body.
    pub fn summary(id: &issue::IssueId, issue: &issue::Issue, aliases: &impl AliasStore) -> Self {
        Self {
            id: id.to_string(),
            author: cobs::Author::new(issue.author().id(), aliases),
            title: issue.title().to_string(),
            state: (*issue.state()).into(),
            assignees: issue
                .assignees()
                .map(|did| cobs::Author::new(did, aliases))
                .collect::<Vec<_>>(),
            body: None,
            comment_count: issue.replies().count(),
            labels: issue.labels().cloned().collect::<Vec<_>>(),
            timestamp: issue.timestamp(),
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", tag = "status")]
#[ts(export)]
#[ts(export_to = "cob/issue/")]
pub enum State {
    Closed {
        reason: CloseReason,
    },
    #[default]
    Open,
}

impl From<State> for issue::State {
    fn from(value: State) -> Self {
        match value {
            State::Closed { reason } => Self::Closed {
                reason: reason.into(),
            },
            State::Open => Self::Open,
        }
    }
}

impl From<issue::State> for State {
    fn from(value: issue::State) -> Self {
        match value {
            issue::State::Closed { reason } => Self::Closed {
                reason: reason.into(),
            },
            issue::State::Open => Self::Open,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/issue/")]
pub enum CloseReason {
    Other,
    Solved,
}

impl From<CloseReason> for issue::CloseReason {
    fn from(value: CloseReason) -> Self {
        match value {
            CloseReason::Other => Self::Other,
            CloseReason::Solved => Self::Solved,
        }
    }
}

impl From<issue::CloseReason> for CloseReason {
    fn from(value: issue::CloseReason) -> Self {
        match value {
            issue::CloseReason::Other => Self::Other,
            issue::CloseReason::Solved => Self::Solved,
        }
    }
}

#[derive(TS, Serialize, Deserialize)]
#[ts(export)]
#[ts(export_to = "cob/issue/")]
#[serde(rename_all = "camelCase")]
pub struct NewIssue {
    pub title: String,
    pub description: String,
    #[ts(as = "Option<Vec<String>>", optional)]
    pub labels: Vec<cob::Label>,
    #[ts(as = "Option<Vec<String>>", optional)]
    pub assignees: Vec<identity::Did>,
    #[ts(as = "Option<_>", optional)]
    pub embeds: Vec<cobs::thread::Embed>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/issue/")]
pub enum Action {
    #[serde(rename = "assign")]
    Assign { assignees: BTreeSet<Author> },

    #[serde(rename = "edit")]
    Edit { title: String },

    #[serde(rename = "lifecycle")]
    Lifecycle { state: cobs::issue::State },

    #[serde(rename = "label")]
    Label {
        #[ts(as = "Vec<String>")]
        labels: BTreeSet<cob::Label>,
    },

    #[serde(rename_all = "camelCase")]
    #[serde(rename = "comment")]
    Comment {
        body: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(as = "Option<String>", optional)]
        reply_to: Option<cob::thread::CommentId>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        #[ts(as = "Option<_>", optional)]
        embeds: Vec<cobs::thread::Embed>,
    },

    #[serde(rename = "comment.edit")]
    CommentEdit {
        #[ts(as = "String")]
        id: cob::thread::CommentId,
        body: String,
        #[ts(as = "Option<_>", optional)]
        embeds: Vec<cobs::thread::Embed>,
    },

    #[serde(rename = "comment.redact")]
    CommentRedact {
        #[ts(as = "String")]
        id: cob::thread::CommentId,
    },

    #[serde(rename = "comment.react")]
    CommentReact {
        #[ts(as = "String")]
        id: cob::thread::CommentId,
        #[ts(as = "String")]
        reaction: cob::Reaction,
        active: bool,
    },
}

impl FromRadicleAction<radicle::issue::Action> for Action {
    fn from_radicle_action(
        value: radicle::issue::Action,
        aliases: &radicle::profile::Aliases,
    ) -> Self {
        match value {
            radicle::issue::Action::Assign { assignees } => Self::Assign {
                assignees: assignees
                    .iter()
                    .map(|a| Author::new(a, aliases))
                    .collect::<BTreeSet<_>>(),
            },
            radicle::issue::Action::Comment {
                body,
                reply_to,
                embeds,
            } => Self::Comment {
                body,
                reply_to,
                embeds: embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
            },
            radicle::issue::Action::CommentEdit { id, body, embeds } => Self::CommentEdit {
                id,
                body,
                embeds: embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
            },
            radicle::issue::Action::CommentReact {
                id,
                reaction,
                active,
            } => Self::CommentReact {
                id,
                reaction,
                active,
            },
            radicle::issue::Action::CommentRedact { id } => Self::CommentRedact { id },
            radicle::issue::Action::Label { labels } => Self::Label { labels },
            radicle::issue::Action::Lifecycle { state } => Self::Lifecycle {
                state: state.into(),
            },
            radicle::issue::Action::Edit { title } => Self::Edit {
                title: title.to_string(),
            },
        }
    }
}
