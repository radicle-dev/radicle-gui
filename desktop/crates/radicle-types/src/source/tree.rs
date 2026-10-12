use std::cmp::Ordering;

use radicle::git::Oid;
use radicle_surf as surf;
use serde::Serialize;
use ts_rs::TS;

use serde::ser::SerializeStruct;

#[derive(TS, Serialize)]
#[ts(export)]
#[ts(export_to = "source/")]
#[serde(rename_all = "camelCase")]
pub struct Tree {
    #[ts(as = "String")]
    id: Oid,
    path: std::path::PathBuf,
    entries: Vec<Entry>,
}

impl Tree {
    pub fn from_surf(tree: surf::tree::Tree, path: &std::path::Path) -> Self {
        Tree {
            id: tree.object_id(),
            path: path.to_path_buf(),
            entries: tree
                .entries()
                .clone()
                .into_iter()
                .map(|entry| Entry::from_surf(entry, path))
                .collect::<Vec<Entry>>(),
        }
    }
}

#[derive(TS)]
#[ts(export)]
#[ts(export_to = "source/")]
pub struct Entry {
    name: String,
    path: std::path::PathBuf,
    #[ts(type = "'tree' | 'blob' | 'submodule'")]
    kind: surf::tree::EntryKind,
}

impl Ord for Entry {
    fn cmp(&self, other: &Self) -> Ordering {
        self.kind.cmp(&other.kind).then(self.name.cmp(&other.name))
    }
}

impl PartialOrd for Entry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for Entry {
    fn eq(&self, other: &Self) -> bool {
        self.kind == other.kind && self.name == other.name
    }
}

impl Eq for Entry {}

impl Entry {
    fn from_surf(entry: surf::tree::Entry, path: &std::path::Path) -> Self {
        Entry {
            name: entry.name().to_string(),
            path: path.to_path_buf().join(entry.name()),
            kind: entry.entry().clone(),
        }
    }
}

impl Entry {
    pub fn object_id(&self) -> Oid {
        match self.kind {
            surf::tree::EntryKind::Blob(id) => id,
            surf::tree::EntryKind::Tree(id) => id,
            surf::tree::EntryKind::Submodule { id, .. } => id,
        }
    }
}

impl Serialize for Entry {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        const FIELDS: usize = 3;
        let mut state = serializer.serialize_struct("TreeEntry", FIELDS)?;
        state.serialize_field("name", &self.name)?;
        state.serialize_field("path", &self.path)?;
        state.serialize_field(
            "kind",
            match self.kind {
                surf::tree::EntryKind::Blob(_) => "blob",
                surf::tree::EntryKind::Tree(_) => "tree",
                surf::tree::EntryKind::Submodule { .. } => "submodule",
            },
        )?;
        state.end()
    }
}
