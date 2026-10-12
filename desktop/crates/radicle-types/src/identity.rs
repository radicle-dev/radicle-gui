use std::collections::BTreeMap;

use serde::Serialize;
use ts_rs::TS;

use radicle::cob::identity;
use radicle::git::canonical::rules::{self, RawRules};
use radicle::identity::doc::{self, GetRawCanonicalRefs};
use radicle::node::AliasStore;

use crate::cobs::Author;
use crate::repo::Visibility;

/// The identity of a repository: the document as it stands now, plus every
/// revision that was ever proposed to it.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub struct Identity {
    #[ts(as = "String")]
    pub rid: radicle::identity::RepoId,
    /// The revision whose commit `refs/rad/id` points at. Unset if the
    /// identity COB has no accepted revision for that commit.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub current: Option<radicle::git::Oid>,
    /// The current document, read from `refs/rad/id`.
    pub doc: Doc,
    /// Every revision, newest first.
    pub revisions: Vec<Revision>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub struct Doc {
    pub version: u32,
    pub delegates: Vec<Author>,
    /// Delegates that must agree on a commit, by having it on their own copy
    /// of the default branch, for it to become canonical. This is *not* what
    /// governs changes to this document — see `majority`.
    pub threshold: usize,
    /// Delegate signatures needed to adopt a new revision of this document:
    /// a simple majority of the delegate set.
    pub majority: usize,
    pub visibility: Visibility,
    pub project: Option<Project>,
    /// The canonical-refs rules heartwood applies: those of the
    /// `xyz.radicle.crefs` payload plus the default-branch rule it synthesizes
    /// from the project payload when there is none.
    pub canonical_refs: Vec<CanonicalRefRule>,
    /// Why heartwood rejects the document's canonical-refs rules, if it does.
    /// `canonical_refs` then holds the payload's rules as written.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub canonical_refs_error: Option<String>,
    /// All payload ids, including ones the UI doesn't render.
    pub payload_ids: Vec<String>,
    /// The document pretty-printed as `rad inspect --identity` prints it.
    pub raw: String,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub struct Project {
    pub name: String,
    pub description: String,
    pub default_branch: String,
}

/// One `refs/...` pattern and the rule that decides its canonical value.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub struct CanonicalRefRule {
    pub pattern: String,
    pub allow: Allowed,
    /// DIDs from `allow` that must agree on a commit or tag, in their own
    /// namespace, for it to become canonical.
    pub threshold: usize,
}

/// Whose refs count towards a canonical ref.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase", tag = "type")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub enum Allowed {
    Delegates,
    Set { dids: Vec<Author> },
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase", tag = "status")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub enum State {
    Active,
    Accepted,
    Rejected { reason: RejectedReason },
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase", tag = "type")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub enum RejectedReason {
    /// Enough delegates rejected it that it can no longer reach a majority.
    Vote,
    Parent,
    Sibling {
        #[ts(as = "String")]
        revision: radicle::git::Oid,
    },
}

impl State {
    /// Redacted revisions have no counterpart: heartwood's
    /// `Identity::revisions()` skips them, as does `rad id list`.
    pub fn new(state: identity::State) -> Option<Self> {
        match state {
            identity::State::Active => Some(State::Active),
            identity::State::Accepted => Some(State::Accepted),
            identity::State::Rejected(by) => Some(State::Rejected {
                reason: match by {
                    identity::RejectedBy::Vote => RejectedReason::Vote,
                    identity::RejectedBy::Parent => RejectedReason::Parent,
                    identity::RejectedBy::Sibling(id) => RejectedReason::Sibling { revision: id },
                },
            }),
            identity::State::Redacted(_) => None,
        }
    }
}

/// A proposed change to the identity document.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub struct Revision {
    #[ts(as = "String")]
    pub id: radicle::git::Oid,
    #[ts(as = "String")]
    pub blob: radicle::git::Oid,
    pub title: String,
    pub description: String,
    pub state: State,
    pub author: Author,
    #[ts(type = "number")]
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub parent: Option<radicle::git::Oid>,
    pub accepted: Vec<Author>,
    pub rejected: Vec<Author>,
    /// Delegates that have not given a verdict. Together with `accepted` and
    /// `rejected` these are the delegates of the parent document, the only
    /// ones whose verdicts count. Empty for the root revision.
    pub pending: Vec<Author>,
    /// Signatures needed to adopt the revision: a majority of the parent
    /// document's delegates. Unset for the root revision, which is accepted
    /// on creation.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub majority: Option<usize>,
    /// The document as it would stand if this revision were adopted,
    /// pretty-printed like `Doc::raw`.
    pub raw: String,
    /// What this revision changes relative to its parent, in domain terms
    /// rather than as a text diff.
    pub changes: Vec<Change>,
    /// The same change as a unified diff of the pretty-printed documents.
    pub diff: String,
}

/// A single field-level difference between a revision and its parent.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase", tag = "type")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub enum Change {
    DelegateAdded {
        delegate: Author,
    },
    DelegateRemoved {
        delegate: Author,
    },
    ThresholdChanged {
        from: usize,
        to: usize,
    },
    VisibilityChanged {
        from: Visibility,
        to: Visibility,
    },
    /// A DID was added to a private repository's allow list.
    AllowAdded {
        peer: Author,
    },
    /// A DID was removed from a private repository's allow list.
    AllowRemoved {
        peer: Author,
    },
    NameChanged {
        from: String,
        to: String,
    },
    DescriptionChanged,
    DefaultBranchChanged {
        from: String,
        to: String,
    },
    /// A payload this app does not model changed, was added or was removed.
    /// The raw document is the place to read the detail.
    PayloadChanged {
        payload: String,
        operation: PayloadOperation,
    },
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "identity/")]
pub enum PayloadOperation {
    Added,
    Removed,
    Updated,
}

impl Doc {
    pub fn new(doc: &doc::Doc, aliases: &impl AliasStore) -> Self {
        let (canonical_refs, canonical_refs_error) = canonical_ref_rules(doc, aliases);
        let payload_ids = doc
            .payload()
            .keys()
            .map(|id| id.to_string())
            .collect::<Vec<_>>();

        let project = doc.project().ok().map(|project| Project {
            name: project.name().to_string(),
            description: project.description().to_string(),
            default_branch: project.default_branch().to_string(),
        });

        Self {
            version: doc.version().number().get(),
            delegates: doc
                .delegates()
                .iter()
                .map(|did| Author::new(did, aliases))
                .collect(),
            threshold: doc.threshold(),
            majority: doc.majority(),
            visibility: Visibility::new(doc.visibility(), aliases),
            project,
            canonical_refs,
            canonical_refs_error,
            payload_ids,
            raw: raw_doc(doc),
        }
    }
}

/// Empty rather than failing the whole view if the document cannot be
/// encoded.
pub fn raw_doc(doc: &doc::Doc) -> String {
    serde_json::to_string_pretty(doc).unwrap_or_default()
}

/// A unified diff of a pretty-printed document against its parent's with
/// full context, as `rad id show` prints it. The root revision is diffed
/// against nothing.
pub fn doc_diff(before: Option<&str>, after: &str) -> String {
    let before = before.unwrap_or_default();
    let mut opts = git2::DiffOptions::new();
    opts.context_lines(u32::MAX);

    git2::Patch::from_buffers(
        before.as_bytes(),
        Some(*doc::PATH),
        after.as_bytes(),
        Some(*doc::PATH),
        Some(&mut opts),
    )
    .and_then(|mut patch| patch.to_buf())
    .ok()
    .and_then(|buf| buf.as_str().ok().map(str::to_owned))
    .unwrap_or_default()
}

/// The canonical-refs rules heartwood applies, including the default-branch
/// rule it synthesizes. If it rejects them, the payload's rules are returned
/// as written along with the reason.
fn canonical_ref_rules(
    doc: &doc::Doc,
    aliases: &impl AliasStore,
) -> (Vec<CanonicalRefRule>, Option<String>) {
    let (rules, error) = match doc.canonical_refs() {
        Ok(crefs) => (RawRules::from(crefs.rules().clone()), None),
        Err(err) => (
            doc.raw_canonical_refs()
                .ok()
                .flatten()
                .map(|crefs| crefs.raw_rules().clone())
                .unwrap_or_default(),
            Some(err.to_string()),
        ),
    };

    let rules = rules
        .iter()
        .map(|(pattern, rule)| CanonicalRefRule {
            pattern: pattern.to_string(),
            allow: match rule.allowed() {
                rules::Allowed::Delegates => Allowed::Delegates,
                rules::Allowed::Set(dids) => Allowed::Set {
                    dids: dids.iter().map(|did| Author::new(did, aliases)).collect(),
                },
            },
            threshold: *rule.threshold(),
        })
        .collect();

    (rules, error)
}

/// Diff two documents field by field, so the UI can say "added delegate X"
/// instead of showing a JSON patch.
pub fn changes(from: Option<&doc::Doc>, to: &doc::Doc, aliases: &impl AliasStore) -> Vec<Change> {
    let Some(from) = from else {
        return Vec::new();
    };
    let mut changes = Vec::new();

    for did in to.delegates().iter() {
        if !from.delegates().contains(did) {
            changes.push(Change::DelegateAdded {
                delegate: Author::new(did, aliases),
            });
        }
    }
    for did in from.delegates().iter() {
        if !to.delegates().contains(did) {
            changes.push(Change::DelegateRemoved {
                delegate: Author::new(did, aliases),
            });
        }
    }

    if from.threshold() != to.threshold() {
        changes.push(Change::ThresholdChanged {
            from: from.threshold(),
            to: to.threshold(),
        });
    }

    if from.visibility().is_public() != to.visibility().is_public() {
        changes.push(Change::VisibilityChanged {
            from: Visibility::new(from.visibility(), aliases),
            to: Visibility::new(to.visibility(), aliases),
        });
    }
    let allow = |visibility: &radicle::identity::Visibility| match visibility {
        radicle::identity::Visibility::Private { allow } => allow.clone(),
        radicle::identity::Visibility::Public => Default::default(),
    };
    let (allow_before, allow_after) = (allow(from.visibility()), allow(to.visibility()));
    for did in allow_after.difference(&allow_before) {
        changes.push(Change::AllowAdded {
            peer: Author::new(did, aliases),
        });
    }
    for did in allow_before.difference(&allow_after) {
        changes.push(Change::AllowRemoved {
            peer: Author::new(did, aliases),
        });
    }

    if let (Ok(before), Ok(after)) = (from.project(), to.project()) {
        if before.name() != after.name() {
            changes.push(Change::NameChanged {
                from: before.name().to_string(),
                to: after.name().to_string(),
            });
        }
        if before.description() != after.description() {
            changes.push(Change::DescriptionChanged);
        }
        if before.default_branch() != after.default_branch() {
            changes.push(Change::DefaultBranchChanged {
                from: before.default_branch().to_string(),
                to: after.default_branch().to_string(),
            });
        }
    }

    changes.extend(payload_changes(from, to));

    changes
}

/// Payloads `changes` does not compare field by field. The project payload is
/// left out only when both documents have one.
fn payload_changes(from: &doc::Doc, to: &doc::Doc) -> Vec<Change> {
    let project = doc::PayloadId::project();
    let compared = from.project().is_ok() && to.project().is_ok();
    let before: BTreeMap<_, _> = from
        .payload()
        .iter()
        .filter(|(id, _)| !compared || **id != project)
        .collect();
    let after: BTreeMap<_, _> = to
        .payload()
        .iter()
        .filter(|(id, _)| !compared || **id != project)
        .collect();

    let mut changes = Vec::new();
    for (id, payload) in &after {
        let operation = match before.get(id) {
            None => PayloadOperation::Added,
            Some(previous) if previous != payload => PayloadOperation::Updated,
            Some(_) => continue,
        };
        changes.push(Change::PayloadChanged {
            payload: id.to_string(),
            operation,
        });
    }
    for id in before.keys() {
        if !after.contains_key(id) {
            changes.push(Change::PayloadChanged {
                payload: id.to_string(),
                operation: PayloadOperation::Removed,
            });
        }
    }
    changes
}
