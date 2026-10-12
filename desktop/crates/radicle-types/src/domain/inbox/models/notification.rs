use std::fmt::Debug;

use radicle::cob::Timestamp;
use radicle::node::notifications::NotificationId;
use radicle::profile::Aliases;
use radicle::{cob, git, identity, node, storage};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::cobs::stream::{self, CobStream};
use crate::cobs::{self, Author};
use crate::domain::patch::models;

#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type", content = "content")]
#[ts(export)]
#[ts(export_to = "cob/inbox/")]
pub enum SetStatusNotifications {
    Ids(Vec<NotificationId>),
    Repo(#[ts(as = "String")] identity::RepoId),
    All,
}

#[derive(Debug, PartialEq, Eq, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename = "camelCase")]
pub struct NotificationRow {
    pub row_id: node::notifications::NotificationId,
    pub timestamp: radicle_localtime::LocalTime,
    /// Node Id that provided us with this notification.
    pub remote: storage::RemoteId,
    pub old: Option<git::Oid>,
    pub new: Option<git::Oid>,
    pub repo: Option<identity::RepoId>,
}

pub type RepoGroup = Vec<(git::fmt::Qualified<'static>, Vec<NotificationRow>)>;
pub type RepoGroupByItem = Vec<Vec<NotificationItem>>;

pub type CountByRepo = (identity::RepoId, usize);

#[derive(Clone, Debug)]
pub struct CountsByRepoParams {
    pub repo: identity::RepoId,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub struct RepoGroupParams {
    pub repos: Option<Vec<identity::RepoId>>,
    pub take: Option<usize>,
    pub all: Option<bool>,
}

#[derive(Debug, thiserror::Error)]
pub enum ListNotificationsError {
    #[error(transparent)]
    RefError(#[from] git::RefError),

    #[error(transparent)]
    SerdeJSON(#[from] serde_json::Error),

    #[error(transparent)]
    Sqlite(#[from] sqlite::Error),

    #[error(transparent)]
    CobStream(#[from] stream::error::Stream),

    #[error(transparent)]
    NotificationKindError(#[from] node::notifications::NotificationKindError),

    #[error(transparent)]
    Unknown(#[from] anyhow::Error),
    // to be extended as new error scenarios are introduced
}

pub fn actions<A>(
    typename: cob::TypeName,
    oid: cob::ObjectId,
    from: Option<git::Oid>,
    until: Option<git::Oid>,
    repo: &storage::git::Repository,
    aliases: &Aliases,
) -> Result<Vec<ActionWithAuthor<A>>, ListNotificationsError>
where
    A: serde::Serialize,
    A: for<'de> serde::Deserialize<'de>,
    A: Debug,
{
    let history = stream::CobRange::new(&typename, &oid);
    let stream = stream::Stream::<A>::new(repo, history, typename, aliases);
    let iter = match (from, until) {
        (None, None) => stream.all()?,
        (None, Some(until)) => stream.until(until)?,
        (Some(from), None) => stream.since(from)?,
        (Some(from), Some(until)) => stream.range(from, until)?,
    };

    Ok(iter.filter_map(|a| a.ok()).collect::<Vec<_>>())
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/inbox/")]
pub struct NotificationsByRepo {
    #[ts(as = "String")]
    pub rid: identity::RepoId,
    pub name: String,
    pub notifications: RepoGroupByItem,
    #[ts(type = "number")]
    pub count: usize,
}

pub type NotificationsByRepoList = Vec<NotificationsByRepo>;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
#[ts(export_to = "cob/inbox/")]
pub enum NotificationItem {
    Issue(Issue),
    Patch(Patch),
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "cob/inbox/")]
pub struct Issue {
    #[ts(as = "String")]
    pub row_id: NotificationId,
    #[ts(as = "String")]
    pub id: cob::ObjectId,
    pub update: RefUpdate,
    pub title: String,
    #[ts(type = "number")]
    pub timestamp: radicle_localtime::LocalTime,
    pub status: cobs::issue::State,
    pub actions: Vec<ActionWithAuthor<cobs::issue::Action>>,
    #[ts(as = "String")]
    pub repo_id: Option<identity::RepoId>,
}

#[derive(Debug, Serialize, TS, Deserialize)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "cob/inbox/")]
pub struct ActionWithAuthor<T> {
    #[ts(as = "String")]
    pub oid: git::Oid,
    #[ts(type = "number")]
    pub timestamp: Timestamp,
    pub author: Author,
    #[serde(flatten)]
    pub action: T,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "cob/inbox/")]
pub struct Patch {
    #[ts(as = "String")]
    pub row_id: NotificationId,
    #[ts(as = "String")]
    pub id: cob::ObjectId,
    pub update: RefUpdate,
    #[ts(type = "number")]
    pub timestamp: radicle_localtime::LocalTime,
    pub title: String,
    pub status: models::patch::State,
    pub actions: Vec<ActionWithAuthor<models::patch::Action>>,
    #[ts(as = "String")]
    pub repo_id: Option<identity::RepoId>,
}

/// Type of notification.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
pub enum NotificationKind {
    /// A COB changed.
    Cob {
        #[serde(flatten)]
        typed_id: TypedId,
    },
    /// A source branch changed.
    Branch {
        #[ts(as = "String")]
        name: git::BranchName,
    },
    /// Unknown reference.
    Unknown {
        #[ts(as = "String")]
        refname: git::fmt::Qualified<'static>,
    },
}

impl From<node::notifications::NotificationKind> for NotificationKind {
    fn from(value: node::notifications::NotificationKind) -> Self {
        match value {
            node::notifications::NotificationKind::Branch { name } => Self::Branch { name },
            node::notifications::NotificationKind::Cob { typed_id } => Self::Cob {
                typed_id: typed_id.into(),
            },
            node::notifications::NotificationKind::Unknown { refname } => Self::Unknown { refname },
        }
    }
}

impl From<NotificationKind> for node::notifications::NotificationKind {
    fn from(value: NotificationKind) -> Self {
        match value {
            NotificationKind::Branch { name } => {
                node::notifications::NotificationKind::Branch { name }
            }
            NotificationKind::Cob { typed_id } => node::notifications::NotificationKind::Cob {
                typed_id: typed_id.into(),
            },
            NotificationKind::Unknown { refname } => {
                node::notifications::NotificationKind::Unknown { refname }
            }
        }
    }
}

/// The exact identifier for a particular COB.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "cob/inbox/")]
pub struct TypedId {
    #[ts(as = "String")]
    pub id: cob::ObjectId,
    #[ts(as = "String")]
    pub type_name: cob::TypeName,
}

impl From<cob::TypedId> for TypedId {
    fn from(value: cob::TypedId) -> Self {
        Self {
            id: value.id,
            type_name: value.type_name,
        }
    }
}

impl From<TypedId> for cob::TypedId {
    fn from(value: TypedId) -> Self {
        Self {
            id: value.id,
            type_name: value.type_name,
        }
    }
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
#[ts(export_to = "cob/inbox/")]
pub enum RefUpdate {
    Updated {
        #[ts(as = "String")]
        name: git::fmt::RefString,
        #[ts(as = "String")]
        old: git::Oid,
        #[ts(as = "String")]
        new: git::Oid,
    },
    Created {
        #[ts(as = "String")]
        name: git::fmt::RefString,
        #[ts(as = "String")]
        oid: git::Oid,
    },
    Deleted {
        #[ts(as = "String")]
        name: git::fmt::RefString,
        #[ts(as = "String")]
        oid: git::Oid,
    },
    Skipped {
        #[ts(as = "String")]
        name: git::fmt::RefString,
        #[ts(as = "String")]
        oid: git::Oid,
    },
}

impl From<storage::RefUpdate> for RefUpdate {
    fn from(value: storage::RefUpdate) -> Self {
        match value {
            storage::RefUpdate::Updated { name, old, new } => RefUpdate::Updated { name, old, new },
            storage::RefUpdate::Created { name, oid } => RefUpdate::Created { name, oid },
            storage::RefUpdate::Deleted { name, oid } => RefUpdate::Deleted { name, oid },
            storage::RefUpdate::Skipped { name, oid } => RefUpdate::Skipped { name, oid },
        }
    }
}

impl From<RefUpdate> for storage::RefUpdate {
    fn from(value: RefUpdate) -> Self {
        match value {
            RefUpdate::Updated { name, old, new } => storage::RefUpdate::Updated { name, old, new },
            RefUpdate::Created { name, oid } => storage::RefUpdate::Created { name, oid },
            RefUpdate::Deleted { name, oid } => storage::RefUpdate::Deleted { name, oid },
            RefUpdate::Skipped { name, oid } => storage::RefUpdate::Skipped { name, oid },
        }
    }
}

impl From<(git::fmt::RefString, Option<git::Oid>, Option<git::Oid>)> for RefUpdate {
    fn from((name, new, old): (git::fmt::RefString, Option<git::Oid>, Option<git::Oid>)) -> Self {
        match (new, old) {
            (None, Some(b)) => RefUpdate::Deleted { name, oid: b },
            (Some(a), None) => RefUpdate::Created { name, oid: a },
            (Some(a), Some(b)) if a != b => RefUpdate::Updated {
                name,
                old: a,
                new: b,
            },
            _ => RefUpdate::Skipped {
                name,
                oid: new.unwrap_or(radicle::git::raw::Oid::ZERO_SHA1.into()),
            },
        }
    }
}
