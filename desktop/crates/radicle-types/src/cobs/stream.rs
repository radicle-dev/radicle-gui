pub mod error;
mod iter;

pub use iter::ActionsIter;
use iter::Walk;

use std::fmt::Debug;
use std::marker::PhantomData;

use radicle::cob::{ObjectId, TypeName};
use radicle::git::Oid;
use radicle::profile::Aliases;
use radicle::storage::git::Repository;
use serde::Deserialize;

use crate::domain::inbox::models::notification::ActionWithAuthor;

/// Helper trait for anything can provide its initial commit. Generally, this is
/// the root of a COB object.
pub trait HasRoot {
    /// Return the root `Oid` of the COB.
    fn root(&self) -> Oid;
}

/// Provide the stream of actions that are related to a given COB.
///
/// The whole history of actions can be retrieved via [`CobStream::all`].
///
/// To constrain the history, use one of [`CobStream::since`],
/// [`CobStream::until`], or [`CobStream::range`].
pub trait CobStream: HasRoot {
    /// Any error that can occur when iterating over the actions.
    type IterError: std::error::Error + Send + Sync + 'static;

    /// The associated `Action` type for the COB.
    type Action: for<'de> Deserialize<'de>;

    /// The iterator that walks over the actions.
    type Iter: Iterator<Item = Result<Self::Action, Self::IterError>>;

    /// Get an iterator of all actions from the inception of the collaborative
    /// object.
    fn all(&self) -> Result<Self::Iter, error::Stream>;

    /// Get an iterator of all actions from the given `oid`, in the
    /// collaborative object's history.
    fn since(&self, oid: Oid) -> Result<Self::Iter, error::Stream>;

    /// Get an iterator of all actions until the given `oid`, in the
    /// collaborative object's history.
    fn until(&self, oid: Oid) -> Result<Self::Iter, error::Stream>;

    /// Get an iterator of all actions `from` the given `Oid`, `until` the
    /// other `Oid`, in the collaborative object's history.
    fn range(&self, from: Oid, until: Oid) -> Result<Self::Iter, error::Stream>;
}

/// The range for iterating over a COB's action history.
///
/// Construct via [`CobRange::new`] to use for constructing a [`Stream`].
#[derive(Clone, Debug)]
pub struct CobRange {
    root: Oid,
    until: iter::Until,
}

impl CobRange {
    /// Construct a `CobRange` for a given COB [`TypeName`] and its
    /// [`ObjectId`] identifier.
    ///
    /// The range will be from the root, given by the [`ObjectId`], to the
    /// reference tips of all remote namespaces.
    pub fn new(typename: &TypeName, object_id: &ObjectId) -> Self {
        let glob = radicle::storage::refs::cobs(typename, object_id);
        Self {
            root: **object_id,
            until: iter::Until::Glob(glob),
        }
    }
}

impl HasRoot for CobRange {
    fn root(&self) -> Oid {
        self.root
    }
}

/// A stream over a COB's actions.
///
/// The generic parameter `A` is filled by the COB's corresponding `Action`
/// type.
///
/// The `Stream` implements [`CobStream`], so iterators over the actions can be
/// constructed via the [`CobStream`] methods.
///
/// To construct a `Stream`, use [`Stream::new`].
pub struct Stream<'a, A> {
    repo: &'a Repository,
    aliases: &'a Aliases,
    range: CobRange,
    typename: TypeName,
    marker: PhantomData<A>,
}

impl<'a, A> Stream<'a, A> {
    /// Construct a new stream providing the underlying `repo`, a [`CobRange`],
    /// and the [`TypeName`] of the COB that is being streamed.
    pub fn new(
        repo: &'a Repository,
        range: CobRange,
        typename: TypeName,
        aliases: &'a Aliases,
    ) -> Self {
        Self {
            repo,
            range,
            typename,
            aliases,
            marker: PhantomData,
        }
    }
}

impl<A> HasRoot for Stream<'_, A> {
    fn root(&self) -> Oid {
        self.range.root()
    }
}

impl<'a, A> CobStream for Stream<'a, A>
where
    A: for<'de> Deserialize<'de>,
    A: Debug,
{
    type IterError = error::Actions;
    type Action = ActionWithAuthor<A>;
    type Iter = ActionsIter<'a, A>;

    fn all(&self) -> Result<Self::Iter, error::Stream> {
        Ok(ActionsIter::new(
            Walk::from(self.range.clone())
                .iter(self.repo)
                .map_err(error::Stream::new)?,
            self.typename.clone(),
            self.repo,
            self.aliases,
        ))
    }

    fn since(&self, oid: Oid) -> Result<Self::Iter, error::Stream> {
        Ok(ActionsIter::new(
            Walk::from(self.range.clone())
                .since(oid)
                .iter(self.repo)
                .map_err(error::Stream::new)?,
            self.typename.clone(),
            self.repo,
            self.aliases,
        ))
    }

    fn until(&self, oid: Oid) -> Result<Self::Iter, error::Stream> {
        Ok(ActionsIter::new(
            Walk::from(self.range.clone())
                .until(oid)
                .iter(self.repo)
                .map_err(error::Stream::new)?,
            self.typename.clone(),
            self.repo,
            self.aliases,
        ))
    }

    fn range(&self, from: Oid, until: Oid) -> Result<Self::Iter, error::Stream> {
        Ok(ActionsIter::new(
            Walk::new(from, until.into())
                .iter(self.repo)
                .map_err(error::Stream::new)?,
            self.typename.clone(),
            self.repo,
            self.aliases,
        ))
    }
}
