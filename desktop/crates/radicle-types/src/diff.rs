//! A manifest of what a diff touches: which files, how each changed, and how
//! many lines either way.
//!
//! Deliberately not the lines themselves. The app renders diffs from `git
//! diff`-format patch text (`get_diff_text`) with `@pierre/diffs`, which parses
//! and highlights it client-side, so serialising every hunk here would send the
//! same content across the IPC boundary a second time for nobody to read. What
//! is left is what the patch text cannot tell the app on its own: whether a file
//! is binary or has no textual change at all, and the per-file and overall
//! stats.

use std::path::PathBuf;

use radicle_surf as surf;
use serde::Serialize;
use ts_rs::TS;

#[derive(Serialize, TS)]
#[ts(export)]
#[ts(export_to = "diff/")]
pub struct Diff {
    pub files: Vec<FileDiff>,
    pub stats: Stats,
}

impl Stats {
    pub fn new(stats: &radicle_surf::diff::Stats) -> Self {
        Self {
            files_changed: stats.files_changed,
            insertions: stats.insertions,
            deletions: stats.deletions,
        }
    }
}

impl From<surf::diff::Diff> for Diff {
    fn from(value: surf::diff::Diff) -> Self {
        Self {
            files: value.files().cloned().map(Into::into).collect::<Vec<_>>(),
            stats: (*value.stats()).into(),
        }
    }
}

#[derive(Serialize, TS)]
#[serde(
    tag = "status",
    rename_all_fields = "camelCase",
    rename_all = "camelCase"
)]
#[ts(export)]
#[ts(export_to = "diff/")]
pub enum FileDiff {
    Added(Added),
    Deleted(Deleted),
    Modified(Modified),
    Moved(Moved),
    Copied(Copied),
}

impl From<surf::diff::FileDiff> for FileDiff {
    fn from(value: surf::diff::FileDiff) -> Self {
        match value {
            surf::diff::FileDiff::Added(surf::diff::Added { path, diff, .. }) => {
                Self::Added(Added {
                    path,
                    diff: diff.into(),
                })
            }
            surf::diff::FileDiff::Deleted(surf::diff::Deleted { path, diff, .. }) => {
                Self::Deleted(Deleted {
                    path,
                    diff: diff.into(),
                })
            }
            surf::diff::FileDiff::Modified(surf::diff::Modified { path, diff, .. }) => {
                Self::Modified(Modified {
                    path,
                    diff: diff.into(),
                })
            }
            surf::diff::FileDiff::Moved(surf::diff::Moved {
                old_path,
                new_path,
                diff,
                ..
            }) => Self::Moved(Moved {
                old_path,
                new_path,
                diff: diff.into(),
            }),
            surf::diff::FileDiff::Copied(surf::diff::Copied {
                old_path,
                new_path,
                diff,
                ..
            }) => Self::Copied(Copied {
                old_path,
                new_path,
                diff: diff.into(),
            }),
        }
    }
}

/// What kind of change a file carries. `Plain` keeps its stats; the other two
/// exist so the app can label a file it cannot render lines for.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all_fields = "camelCase",
    rename_all = "camelCase"
)]
#[ts(export)]
#[ts(export_to = "diff/")]
pub enum DiffContent {
    Binary,
    Plain { stats: FileStats },
    Empty,
}

impl From<surf::diff::DiffContent> for DiffContent {
    fn from(value: surf::diff::DiffContent) -> Self {
        match value {
            surf::diff::DiffContent::Plain { stats, .. } => Self::Plain {
                stats: stats.into(),
            },
            surf::diff::DiffContent::Binary => Self::Binary,
            surf::diff::DiffContent::Empty => Self::Empty,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "diff/")]
pub struct Added {
    pub path: PathBuf,
    pub diff: DiffContent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "diff/")]
pub struct Deleted {
    pub path: PathBuf,
    pub diff: DiffContent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "diff/")]
pub struct Moved {
    pub old_path: PathBuf,
    pub new_path: PathBuf,
    pub diff: DiffContent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "diff/")]
pub struct Copied {
    pub old_path: PathBuf,
    pub new_path: PathBuf,
    pub diff: DiffContent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "diff/")]
pub struct Modified {
    pub path: PathBuf,
    pub diff: DiffContent,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "diff/")]
pub struct Stats {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

impl From<surf::diff::Stats> for Stats {
    fn from(value: surf::diff::Stats) -> Self {
        Self {
            files_changed: value.files_changed,
            insertions: value.insertions,
            deletions: value.deletions,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "diff/")]
pub struct FileStats {
    pub additions: usize,
    pub deletions: usize,
}

impl From<surf::diff::FileStats> for FileStats {
    fn from(value: surf::diff::FileStats) -> Self {
        Self {
            additions: value.additions,
            deletions: value.deletions,
        }
    }
}
