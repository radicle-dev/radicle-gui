use radicle_surf::{self as surf};
use serde_json::{json, Value};

use radicle::cob;

pub(crate) struct Diff<'a>(&'a surf::diff::Diff);

impl<'a> Diff<'a> {
    pub fn new(diff: &'a surf::diff::Diff) -> Self {
        Self(diff)
    }

    pub fn as_json(&self) -> Value {
        let s = self.0.stats();
        json!({
            "files": self.0.files().map(|f| {
                match f {
                    surf::diff::FileDiff::Added(added) => json!({
                        "status": "added",
                        "path": added.path,
                        "diff": DiffContent::new(&added.diff).as_json(),
                        "new": DiffFile::new(&added.new).as_json(),
                    }),
                    surf::diff::FileDiff::Deleted(deleted) => json!({
                        "status": "deleted",
                        "path": deleted.path,
                        "diff": DiffContent::new(&deleted.diff).as_json(),
                        "old": DiffFile::new(&deleted.old).as_json(),
                    }),
                    surf::diff::FileDiff::Modified(modified) => json!({
                        "status": "modified",
                        "path": modified.path,
                        "diff": DiffContent::new(&modified.diff).as_json(),
                        "old": DiffFile::new(&modified.old).as_json(),
                        "new": DiffFile::new(&modified.new).as_json(),
                    }),
                    surf::diff::FileDiff::Moved(moved) => {
                        if moved.old == moved.new {
                            json!({
                                "status": "moved",
                                "oldPath": moved.old_path,
                                "newPath": moved.new_path,
                                "current": DiffFile::new(&moved.new).as_json(),
                            })
                        } else {
                            json!({
                                "status": "moved",
                                "oldPath": moved.old_path,
                                "newPath": moved.new_path,
                                "old": DiffFile::new(&moved.old).as_json(),
                                "new": DiffFile::new(&moved.new).as_json(),
                                "diff": DiffContent::new(&moved.diff).as_json()
                            })
                        }
                    },
                    surf::diff::FileDiff::Copied(copied) => {
                        if copied.old == copied.new {
                            json!({
                                "status": "copied",
                                "oldPath": copied.old_path,
                                "newPath": copied.new_path,
                                "current": DiffFile::new(&copied.new).as_json()
                            })
                        } else {
                            json!({
                                "status": "copied",
                                "oldPath": copied.old_path,
                                "newPath": copied.new_path,
                                "old": DiffFile::new(&copied.old).as_json(),
                                "new": DiffFile::new(&copied.new).as_json(),
                                "diff": DiffContent::new(&copied.diff).as_json()
                            })
                        }
                    },
                }
            }).collect::<Vec<_>>(),
            "stats": json!({
                 "filesChanged": s.files_changed,
                 "insertions": s.insertions,
                 "deletions": s.deletions,
            }),
        })
    }
}

pub(crate) struct CodeLocation<'a>(&'a cob::CodeLocation);

impl<'a> CodeLocation<'a> {
    pub fn new(location: &'a cob::CodeLocation) -> Self {
        Self(location)
    }

    pub fn as_json(&self) -> Value {
        match (&self.0.old, &self.0.new) {
            (Some(old), Some(new)) => json!({
                "commit": self.0.commit,
                "path": self.0.path,
                "old": code_range(old),
                "new": code_range(new)
            }),
            (None, Some(new)) => json!({
                "commit": self.0.commit,
                "path": self.0.path,
                "new": code_range(new)
            }),
            (Some(old), None) => json!({
                "commit": self.0.commit,
                "path": self.0.path,
                "old": code_range(old)
            }),
            (None, None) => json!({
                "commit": self.0.commit,
                "path": self.0.path
            }),
        }
    }
}

fn code_range(range: &cob::CodeRange) -> Value {
    match range {
        cob::CodeRange::Lines { range } => json!({
            "type": "lines",
            "range": range
        }),
        cob::CodeRange::Chars { line, range } => {
            json!({ "type": "chars", "line": line, "range": range })
        }
    }
}

pub(crate) struct DiffContent<'a>(&'a surf::diff::DiffContent);

impl<'a> DiffContent<'a> {
    pub fn new(value: &'a surf::diff::DiffContent) -> Self {
        Self(value)
    }

    pub fn as_json(&self) -> Value {
        match self.0 {
            surf::diff::DiffContent::Binary => json!({ "type": "binary" }),
            surf::diff::DiffContent::Empty => json!({ "type": "empty" }),
            surf::diff::DiffContent::Plain { hunks, stats, eof } => {
                let hunks = hunks
                    .iter()
                    .map(|h| Hunk::new(h).as_json())
                    .collect::<Vec<_>>();

                json!({
                    "type": "plain",
                    "hunks": hunks,
                    "stats": json!({
                        "additions": stats.additions,
                        "deletions": stats.deletions
                    }),
                    "eof": match eof {
                        surf::diff::EofNewLine::OldMissing => "oldMissing",
                        surf::diff::EofNewLine::NewMissing => "newMissing",
                        surf::diff::EofNewLine::BothMissing => "bothMissing",
                        surf::diff::EofNewLine::NoneMissing => "noneMissing",
                    }
                })
            }
        }
    }
}

pub(crate) struct DiffFile<'a>(&'a surf::diff::DiffFile);

impl<'a> DiffFile<'a> {
    pub fn new(value: &'a surf::diff::DiffFile) -> Self {
        Self(value)
    }

    pub fn as_json(&self) -> Value {
        json!({ "oid": self.0.oid, "mode": match self.0.mode {
            surf::diff::FileMode::Blob => "blob",
            surf::diff::FileMode::BlobExecutable => "blobExecutable",
            surf::diff::FileMode::Tree => "tree",
            surf::diff::FileMode::Link => "link",
            surf::diff::FileMode::Commit => "commit",
        } })
    }
}

pub(crate) struct Modification<'a>(&'a surf::diff::Modification);

impl<'a> Modification<'a> {
    pub fn new(value: &'a surf::diff::Modification) -> Self {
        Self(value)
    }

    pub fn as_json(&self) -> Value {
        match self.0 {
            surf::diff::Modification::Addition(addition) => {
                json!({
                    "type": "addition",
                    "line": addition.line.clone().from_utf8().ok(),
                    "lineNo": addition.line_no
                })
            }
            surf::diff::Modification::Deletion(deletion) => {
                json!({
                    "type": "deletion",
                    "line": deletion.line.clone().from_utf8().ok(),
                    "lineNo": deletion.line_no
                })
            }
            surf::diff::Modification::Context {
                line,
                line_no_old,
                line_no_new,
            } => {
                json!({
                    "type": "context",
                    "line": line.clone().from_utf8().ok(),
                    "lineNoOld": line_no_old,
                    "lineNoNew": line_no_new
                })
            }
        }
    }
}

pub(crate) struct Hunk<'a>(&'a surf::diff::Hunk<surf::diff::Modification>);

impl<'a> Hunk<'a> {
    pub fn new(value: &'a surf::diff::Hunk<surf::diff::Modification>) -> Self {
        Self(value)
    }

    pub fn as_json(&self) -> Value {
        let lines = self
            .0
            .lines
            .iter()
            .map(|line| Modification::new(line).as_json())
            .collect::<Vec<_>>();

        json!({
            "header": self.0.header,
            "lines": lines,
            "old": self.0.old,
            "new": self.0.new,
        })
    }
}
