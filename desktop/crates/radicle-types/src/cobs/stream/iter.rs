use std::fmt::Debug;
use std::marker::PhantomData;
use std::path::Path;

use serde::Deserialize;
use serde_json as json;

use radicle::cob::change::Storage;
use radicle::cob::{Manifest, Op, TypeName};
use radicle::git;
use radicle::git::Oid;
use radicle::profile::Aliases;
use radicle::storage::git::Repository;

use crate::cobs::Author;
use crate::domain::inbox::models::notification::ActionWithAuthor;

use super::CobRange;
use super::error;

/// A `Walk` specifies a range to construct a [`WalkIter`].
#[derive(Clone, Debug)]
pub(super) struct Walk {
    from: Oid,
    until: Until,
}

/// Specify the end of a range by either providing an [`Oid`] tip, or a
/// reference glob via a [`PatternString`].
#[derive(Clone, Debug)]
pub enum Until {
    Tip(Oid),
    Glob(git::fmt::refspec::PatternString),
}

impl From<Oid> for Until {
    fn from(tip: Oid) -> Self {
        Self::Tip(tip)
    }
}

impl From<git::fmt::refspec::PatternString> for Until {
    fn from(glob: git::fmt::refspec::PatternString) -> Self {
        Self::Glob(glob)
    }
}

/// A revwalk over a set of commits, including the commit that is being walked
/// from.
pub(super) struct WalkIter<'a> {
    /// Git repository for looking up the commit object during the revwalk.
    repo: &'a Repository,
    /// The root commit that is being walked from.
    ///
    /// N.b. This is required since ranges are non-inclusive in Git, and if the
    /// `^` notation is used with a root commit, then it will result in an
    /// error.
    from: Option<Oid>,
    /// The revwalk that is being iterated over.
    inner: git2::Revwalk<'a>,
}

impl From<CobRange> for Walk {
    fn from(history: CobRange) -> Self {
        Self::new(history.root, history.until)
    }
}

impl Walk {
    /// Construct a new `Walk`, `from` the given commit, `until` the end of a
    /// given range.
    pub(super) fn new(from: Oid, until: Until) -> Self {
        Self { from, until }
    }

    /// Change the `Oid` that the walk starts from.
    pub(super) fn since(mut self, from: Oid) -> Self {
        self.from = from;
        self
    }

    /// Change the `Until` that the walk finishes on.
    pub(super) fn until(mut self, until: impl Into<Until>) -> Self {
        self.until = until.into();
        self
    }

    /// Get the iterator for the walk.
    pub(super) fn iter(self, repo: &Repository) -> Result<WalkIter<'_>, git::raw::Error> {
        let mut walk = repo.backend.revwalk()?;
        // N.b. ensure that we start from the `self.from` commit.
        walk.set_sorting(git2::Sort::TOPOLOGICAL.union(git2::Sort::REVERSE))?;
        match self.until {
            Until::Tip(tip) => walk.push_range(&format!("{}..{}", self.from, tip))?,
            Until::Glob(glob) => {
                walk.push(git2::Oid::from(self.from))?;
                walk.push_glob(glob.as_str())?
            }
        }

        Ok(WalkIter {
            repo,
            from: Some(self.from),
            inner: walk,
        })
    }
}

impl<'a> Iterator for WalkIter<'a> {
    type Item = Result<git::raw::Commit<'a>, git::raw::Error>;

    fn next(&mut self) -> Option<Self::Item> {
        // N.b. ensure that we start using the `from` commit and use the revwalk
        // after that.
        if let Some(from) = self.from.take() {
            return Some(self.repo.backend.find_commit(git2::Oid::from(from)));
        }
        let oid = self.inner.next()?;
        Some(oid.and_then(|oid| self.repo.backend.find_commit(oid)))
    }
}

/// Iterate over all actions for a given range of commits.
pub struct ActionsIter<'a, A> {
    /// The [`WalkIter`] provides each commit that it is being walked over for a
    /// given range.
    walk: WalkIter<'a>,
    /// For each commit in `walk`, a [`TreeActionsIter`] is then constructed to
    /// iterate over, returning each action in that tree.
    tree: Option<TreeActionsIter<'a, A>>,
    /// The walk can iterate over other COBs, e.g. an Identity COB, so this is
    /// used to filter for the correct type.
    typename: TypeName,
    repo: &'a Repository,
    aliases: &'a Aliases,
}

impl<'a, A> ActionsIter<'a, A> {
    pub(super) fn new(
        walk: WalkIter<'a>,
        typename: TypeName,
        repo: &'a Repository,
        aliases: &'a Aliases,
    ) -> Self {
        Self {
            walk,
            tree: None,
            typename,
            repo,
            aliases,
        }
    }

    fn matches_manifest(&self, tree: &git2::Tree) -> Result<bool, error::Actions> {
        let entry = match tree.get_path(Path::new("manifest")) {
            Ok(entry) => entry,
            Err(err) if matches!(err.code(), git::raw::ErrorCode::NotFound) => return Ok(false),
            Err(err) => {
                return Err(error::Actions::ManifestPath {
                    oid: tree.id().into(),
                    err,
                });
            }
        };
        let object = entry
            .to_object(&self.walk.repo.backend)
            .map_err(|err| error::TreeAction::InvalidEntry { err })?;
        let blob = object
            .into_blob()
            .map_err(|obj| error::TreeAction::InvalidObject {
                obj: obj
                    .kind()
                    .map_or("unknown".to_string(), |kind| kind.to_string()),
            })?;
        let manifest = serde_json::from_slice::<Manifest>(blob.content()).map_err(|err| {
            error::Actions::Manifest {
                oid: blob.id().into(),
                err,
            }
        })?;
        Ok(manifest.type_name == self.typename)
    }
}

impl<A> Iterator for ActionsIter<'_, A>
where
    A: for<'de> Deserialize<'de>,
    A: Debug,
{
    type Item = Result<ActionWithAuthor<A>, error::Actions>;

    fn next(&mut self) -> Option<Self::Item> {
        // Are we currently iterating over a tree?
        match self.tree {
            // Yes, so we check that tree iterator
            Some(ref mut iter) => match iter.next() {
                // Return the action from the tree iterator
                Some(a) => Some(a.map_err(error::Actions::from)),
                // The tree iterator is exhausted, so we set it to None, and
                // recurse to check the next commit iterator.
                None => {
                    self.tree = None;
                    self.next()
                }
            },
            // No, so we check the commit iterator
            None => {
                match self.walk.next() {
                    Some(Ok(commit)) => match commit.tree() {
                        Ok(tree) => {
                            // Skip commits that are not for this COB type
                            match Self::matches_manifest(self, &tree) {
                                Ok(matches) => {
                                    if !matches {
                                        return self.next();
                                    }
                                }
                                Err(err) => return Some(Err(err)),
                            }

                            let entry = self.repo.load(commit.id().into()).ok()?;
                            let op = Op::from(entry);
                            let author = Author::new(&op.author.into(), self.aliases);
                            // Set the tree iterator and walk over that
                            self.tree =
                                Some(TreeActionsIter::new(self.walk.repo, tree, op, author));
                            // Hide this commit so we do not double process it
                            self.walk.inner.hide(commit.id()).ok();
                            self.next()
                        }
                        Err(err) => Some(Err(error::Actions::Tree {
                            oid: commit.id().into(),
                            err,
                        })),
                    },
                    // Something was wrong with the commit
                    Some(Err(err)) => Some(Err(error::Actions::Commit { err })),
                    // The walk iterator is also finished, so the whole process is finished
                    None => None,
                }
            }
        }
    }
}

/// Iterator over tree entries to load each action.
struct TreeActionsIter<'a, A> {
    /// The repository is required to get the underlying object of the tree
    /// entry.
    repo: &'a Repository,
    /// The Git tree from which the actions are being extracted.
    tree: git2::Tree<'a>,
    op: Op<Vec<u8>>,
    author: Author,
    /// Use an index to keep track of which entry is being processed. Note that
    /// `TreeIter` is *not* used since it poses many borrow-checker challenge.
    /// Instead, `self.tree.iter()` is called and the iterator is indexed into.
    index: usize,
    /// Use a marker for the generic `A` action type.
    marker: PhantomData<A>,
}

impl<'a, A> TreeActionsIter<'a, A> {
    fn new(repo: &'a Repository, tree: git2::Tree<'a>, op: Op<Vec<u8>>, author: Author) -> Self
    where
        A: for<'de> Deserialize<'de>,
    {
        Self {
            repo,
            tree,
            op,
            author,
            index: 0,
            marker: PhantomData,
        }
    }
}

impl<A> Iterator for TreeActionsIter<'_, A>
where
    A: for<'de> Deserialize<'de>,
{
    type Item = Result<ActionWithAuthor<A>, error::TreeAction>;

    fn next(&mut self) -> Option<Self::Item> {
        let entry = self.tree.iter().nth(self.index)?;
        self.index += 1;
        // N.b. if `from_tree_entry` is `None` we have filtered the entry so we
        // go the `next` entry
        from_tree_entry(self.repo, entry, self.op.clone(), self.author.clone())
            .or_else(|| self.next())
    }
}

/// Helper to construct the action for the tree entry, if it should be an action
/// entry.
///
/// The entry is only an action if it is a blob and its name is numerical.
fn from_tree_entry<A>(
    repo: &Repository,
    entry: git2::TreeEntry<'_>,
    op: Op<Vec<u8>>,
    author: Author,
) -> Option<Result<ActionWithAuthor<A>, error::TreeAction>>
where
    A: for<'de> Deserialize<'de>,
{
    let as_action = |entry: git2::TreeEntry<'_>| -> Result<ActionWithAuthor<A>, error::TreeAction> {
        let object = entry
            .to_object(&repo.backend)
            .map_err(|err| error::TreeAction::InvalidEntry { err })?;
        let blob = object
            .into_blob()
            .map_err(|obj| error::TreeAction::InvalidObject {
                obj: obj
                    .kind()
                    .map_or("unknown".to_string(), |kind| kind.to_string()),
            })?;
        action(&blob, op, author).map_err(error::TreeAction::from)
    };
    let name = entry.name().ok()?;
    // An entry is only considered an action if it:
    //   a) Is a blob
    //   b) Its name is numeric, e.g. 1, 2, 3, etc.
    let is_action = entry.filemode() == i32::from(git::raw::FileMode::Blob)
        && name.chars().all(|c| c.is_numeric());
    is_action.then(|| as_action(entry))
}

/// Helper to deserialize an action from a blob's contents.
fn action<A>(
    blob: &git2::Blob<'_>,
    op: Op<Vec<u8>>,
    author: Author,
) -> Result<ActionWithAuthor<A>, error::Action>
where
    A: for<'de> Deserialize<'de>,
{
    let action = json::from_slice::<A>(blob.content())
        .map_err(|err| error::Action::new(blob.id().into(), err))?;

    Ok(ActionWithAuthor {
        author,
        timestamp: op.timestamp,
        oid: op.id,
        action,
    })
}
