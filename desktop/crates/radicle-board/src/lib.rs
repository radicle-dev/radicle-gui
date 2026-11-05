//! A board collaborative object: a repository's issues and patches arranged
//! in columns. It stores only placement; titles, state and labels come from
//! the cards' own objects.
//!
//! Delegates may change anything. A card may also be moved by the author of
//! its issue or patch, and by an assignee who names the issue operation that
//! assigned them as proof. Everything a check reads is linked from the board
//! operation, so it replicates with it and every peer reaches the same
//! verdict. Actions that fail a check are ignored rather than rejected, so
//! nothing a peer writes drops later operations. Closing columns follow the
//! issue's own rules: only a delegate or the author moves an issue into or
//! out of one, and patches never enter one.

use std::collections::BTreeMap;
use std::ops::Deref;
use std::str::FromStr;
use std::sync::LazyLock;

use radicle::cob::store::{self, CobAction, CobWithType, access};
use radicle::cob::{self, ActorId, Evaluate, ObjectId, Op, Timestamp, TypeName};
use radicle::crypto;
use radicle::git::Oid;
use radicle::identity::{Did, DocAt, RepoId};
use radicle::node::NodeId;
use radicle::storage::{
    ReadRepository, ReadStorage, RepositoryError, SignRepository, WriteRepository,
};
use serde::{Deserialize, Serialize};

pub mod position;

pub static TYPENAME: LazyLock<TypeName> =
    LazyLock::new(|| FromStr::from_str("works.monadic.board").expect("type name is valid"));

/// The newest format version this crate reads. Heartwood writes every
/// operation as version 1 and gives writers no way to choose, so raising this
/// needs heartwood to let us set the manifest version first.
pub const VERSION: usize = 1;

/// The evaluator's limits, in UTF-8 bytes.
pub const MAX_NAME_LEN: usize = 100;
pub const MAX_COLUMNS: usize = 50;
pub const MAX_COLUMN_ID_LEN: usize = 64;
pub const MAX_POSITION_LEN: usize = 64;

pub fn supported(version: cob::Version) -> bool {
    usize::from(version) <= VERSION
}

pub type BoardId = ObjectId;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Card {
    pub rid: RepoId,
    #[serde(rename = "type")]
    pub type_name: TypeName,
    pub oid: ObjectId,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Closes {
    Solved,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub closes: Option<Closes>,
}

impl Column {
    pub fn new(id: &str, name: &str, closes: Option<Closes>) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            closes,
        }
    }
}

pub fn default_columns() -> Vec<Column> {
    vec![
        Column::new("backlog", "Backlog", None),
        Column::new("todo", "Todo", None),
        Column::new("in-progress", "In Progress", None),
        Column::new("in-review", "In Review", None),
        Column::new("done", "Done", Some(Closes::Solved)),
        Column::new("canceled", "Canceled", Some(Closes::Other)),
    ]
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub column: String,
    pub position: String,
    pub moved_by: ActorId,
    pub moved_at: Timestamp,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    /// Rename the board. The root operation must start with this action.
    #[serde(rename = "edit")]
    Edit { name: String },
    #[serde(rename = "columns")]
    Columns { columns: Vec<Column> },
    #[serde(rename = "move")]
    Move {
        card: Card,
        column: String,
        position: String,
        /// The issue operation that assigned the mover to the card's issue.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        proof: Option<Oid>,
        /// Whether the card's object lives in the board's repository, so
        /// that the operation links it. Set when the operation is created.
        #[serde(skip)]
        local: bool,
    },
    #[serde(rename = "remove")]
    Remove { card: Card },
}

impl CobAction for Action {
    fn parents(&self) -> Vec<Oid> {
        match self {
            Action::Move {
                card, proof, local, ..
            } => {
                let mut parents = Vec::new();
                if *local {
                    parents.push(*card.oid);
                }
                parents.extend(proof);
                parents
            }
            _ => Vec::new(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("the first action of a board must be `edit`")]
    Init,
    #[error("a board can only be created by a delegate")]
    NotDelegate,
    #[error("operation has no identity document")]
    MissingIdentity,
    #[error(transparent)]
    Doc(#[from] radicle::identity::DocError),
    #[error(transparent)]
    Op(#[from] cob::op::OpEncodingError),
    #[error(transparent)]
    Store(#[from] store::Error),
    #[error("the board is in format version {0}, newer than this version reads")]
    Version(usize),
    #[error("invalid board: {0}")]
    Invalid(&'static str),
}

/// Why a card can't go on a board.
#[derive(Debug, thiserror::Error)]
pub enum ShareError {
    #[error("the card's repository {0} isn't available locally")]
    Unavailable(RepoId),
    #[error("cards from private repositories can only go on their own repository's boards")]
    Private(RepoId),
}

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error(transparent)]
    Share(#[from] ShareError),
    #[error(transparent)]
    Store(#[from] store::Error),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Board {
    name: String,
    created_at: Timestamp,
    columns: Vec<Column>,
    cards: BTreeMap<Card, Placement>,
}

impl Board {
    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn created_at(&self) -> Timestamp {
        self.created_at
    }

    pub fn columns(&self) -> &[Column] {
        &self.columns
    }

    pub fn placement(&self, card: &Card) -> Option<&Placement> {
        self.cards.get(card)
    }

    /// Cards in board order. A card placed in a column the board doesn't
    /// have is left out, so it shows as unplaced until that column exists.
    /// Ties in position are broken by card, so concurrent moves to the same
    /// position settle the same way everywhere.
    pub fn cards(&self) -> Vec<(&Card, &Placement)> {
        let mut cards: Vec<_> = self
            .cards
            .iter()
            .filter_map(|(card, placement)| {
                let column = self.columns.iter().position(|c| c.id == placement.column)?;
                Some((column, card, placement))
            })
            .collect();
        cards.sort_by(|(a_col, a_card, a), (b_col, b_card, b)| {
            a_col
                .cmp(b_col)
                .then_with(|| a.position.cmp(&b.position))
                .then_with(|| a_card.cmp(b_card))
        });
        cards
            .into_iter()
            .map(|(_, card, placement)| (card, placement))
            .collect()
    }

    /// What `column` does to issues. A column the board doesn't have closes
    /// nothing.
    fn closes(&self, column: &str) -> Option<Closes> {
        self.columns
            .iter()
            .find(|c| c.id == column)
            .and_then(|c| c.closes)
    }

    fn apply_action(&mut self, action: Action, author: ActorId, timestamp: Timestamp) {
        match action {
            Action::Edit { name } => {
                if !name.is_empty() && name.len() <= MAX_NAME_LEN {
                    self.name = name;
                }
            }
            Action::Columns { columns } => {
                if valid_columns(&columns) {
                    self.columns = columns;
                }
            }
            Action::Move {
                card,
                column,
                position,
                ..
            } => {
                // The column doesn't have to exist: a move counts whatever
                // order it lands in against concurrent column changes, and a
                // card whose column is gone shows in a fallback one.
                if position::is_valid(&position)
                    && position.len() <= MAX_POSITION_LEN
                    && !column.is_empty()
                    && column.len() <= MAX_COLUMN_ID_LEN
                {
                    self.cards.insert(
                        card,
                        Placement {
                            column,
                            position,
                            moved_by: author,
                            moved_at: timestamp,
                        },
                    );
                }
            }
            Action::Remove { card } => {
                self.cards.remove(&card);
            }
        }
    }
}

pub fn valid_columns(columns: &[Column]) -> bool {
    !columns.is_empty()
        && columns.len() <= MAX_COLUMNS
        && columns.iter().all(|c| {
            !c.id.is_empty()
                && c.id.len() <= MAX_COLUMN_ID_LEN
                && !c.name.is_empty()
                && c.name.len() <= MAX_NAME_LEN
        })
        && columns
            .iter()
            .enumerate()
            .all(|(i, c)| columns[..i].iter().all(|d| d.id != c.id))
}

fn authorized<R>(
    board: &Board,
    action: &Action,
    author: &ActorId,
    parents: &[Oid],
    doc: &DocAt,
    repo: &R,
) -> bool
where
    R: ReadRepository
        + cob::change::Storage<
            ObjectId = Oid,
            Parent = Oid,
            PublicKey = crypto::PublicKey,
            Signature = crypto::Signature,
        >,
{
    let delegate = doc.is_delegate(&Did::from(*author));
    let Action::Move {
        card,
        column,
        proof,
        ..
    } = action
    else {
        return delegate;
    };
    let issue = card.type_name == *cob::issue::TYPENAME;
    if !issue && card.type_name != *cob::patch::TYPENAME {
        return false;
    }
    let target = board.closes(column);
    if target.is_some() && !issue {
        return false;
    }
    // A card from another repository can't be loaded, so only its type name
    // is checked, for delegates too.
    if card.rid != repo.id() {
        return delegate;
    }
    // The card's root has to travel with the op, or its later arrival could
    // change this verdict without the board's tips changing.
    if !parents.contains(&*card.oid) {
        return false;
    }

    let Ok(root) = cob::change::Storage::load(repo, *card.oid) else {
        return false;
    };
    if !root.valid_signatures()
        || root.manifest.type_name != card.type_name
        || !root.parents.is_empty()
    {
        return false;
    }
    if delegate || *root.author() == *author {
        return true;
    }

    // Others may only move a card between columns that do the same thing to
    // it, so the move can't close, reopen or change why an issue is closed.
    let source = board.placement(card).and_then(|p| board.closes(&p.column));
    if !issue || source != target {
        return false;
    }

    // The proof, too, has to travel with the op.
    proof.is_some_and(|proof| parents.contains(&proof) && assigned(&card.oid, &proof, author, repo))
}

/// The identity commit that `op` names, if it's one of the op's git parents.
/// The commits an op relies on must be its git parents, not just named in its
/// trailers, so every peer evaluates it the same way.
fn linked_identity<R: ReadRepository>(op: Oid, identity: Option<Oid>, repo: &R) -> Option<Oid> {
    let head = identity?;
    let commit = repo.commit(op).ok()?;
    let linked = commit.parent_ids().any(|parent| Oid::from(parent) == head);
    linked.then_some(head)
}

/// Whether `proof` is an operation of `issue` in which a delegate assigned
/// `author`.
fn assigned<R>(issue: &Oid, proof: &Oid, author: &ActorId, repo: &R) -> bool
where
    R: ReadRepository
        + cob::change::Storage<
            ObjectId = Oid,
            Parent = Oid,
            PublicKey = crypto::PublicKey,
            Signature = crypto::Signature,
        >,
{
    let Ok(entry) = cob::change::Storage::load(repo, *proof) else {
        return false;
    };
    if !entry.valid_signatures() || entry.manifest.type_name != *cob::issue::TYPENAME {
        return false;
    }
    let Ok(op) = Op::<cob::issue::Action>::try_from(&entry) else {
        return false;
    };
    if proof != issue && !matches!(repo.is_ancestor_of(*issue, *proof), Ok(true)) {
        return false;
    }
    if linked_identity(*proof, op.identity, repo).is_none() {
        return false;
    }
    let Ok(Some(doc)) = op.identity_doc(repo) else {
        return false;
    };
    if !doc.is_delegate(&Did::from(op.author)) {
        return false;
    }
    let author = Did::from(*author);

    op.actions.iter().any(|action| match action {
        cob::issue::Action::Assign { assignees } => assignees.contains(&author),
        _ => false,
    })
}

impl CobWithType for Board {
    fn type_name() -> &'static TypeName {
        &TYPENAME
    }
}

impl store::Cob for Board {
    type Action = Action;
    type Error = Error;

    fn from_root<R: ReadRepository>(op: Op<Action>, repo: &R) -> Result<Self, Error> {
        if linked_identity(op.id, op.identity, repo).is_none() {
            return Err(Error::MissingIdentity);
        }
        let doc = op.identity_doc(repo)?.ok_or(Error::MissingIdentity)?;
        if !doc.is_delegate(&Did::from(op.author)) {
            return Err(Error::NotDelegate);
        }
        let mut actions = op.actions.into_iter();
        let Some(Action::Edit { name }) = actions.next() else {
            return Err(Error::Init);
        };
        if name.is_empty() || name.len() > MAX_NAME_LEN {
            return Err(Error::Invalid("the board name is empty or too long"));
        }
        let mut board = Board {
            name,
            created_at: op.timestamp,
            columns: default_columns(),
            cards: BTreeMap::new(),
        };
        // The root's author is a delegate, so every action in it is allowed.
        for action in actions {
            board.apply_action(action, op.author, op.timestamp);
        }

        Ok(board)
    }

    fn op<'a, R: ReadRepository, I: IntoIterator<Item = &'a cob::Entry>>(
        &mut self,
        _op: Op<Action>,
        _concurrent: I,
        _repo: &R,
    ) -> Result<(), Error> {
        // Never called: `store::Store` requires `Cob`, but boards are evaluated
        // through `Evaluate`, whose repository can load the linked objects.
        Err(Error::Invalid("boards are evaluated through `Evaluate`"))
    }
}

impl<R> Evaluate<R> for Board
where
    R: ReadRepository
        + cob::change::Storage<
            ObjectId = Oid,
            Parent = Oid,
            PublicKey = crypto::PublicKey,
            Signature = crypto::Signature,
        >,
{
    type Error = Error;

    fn init(entry: &cob::Entry, repo: &R) -> Result<Self, Error> {
        // Checked before decoding, as a newer format's actions may not decode.
        if !supported(entry.manifest.version) {
            return Err(Error::Version(entry.manifest.version.into()));
        }
        let op = Op::try_from(entry)?;
        <Board as store::Cob>::from_root(op, repo)
    }

    fn apply<'a, I: Iterator<Item = (&'a cob::EntryId, &'a cob::Entry)>>(
        &mut self,
        entry: &cob::Entry,
        _concurrent: I,
        repo: &R,
    ) -> Result<(), Error> {
        if !supported(entry.manifest.version) {
            log::debug!(target: "board", "Ignoring operation {} in a newer format", entry.id);
            return Ok(());
        }
        let op = match Op::<Action>::try_from(entry) {
            Ok(op) => op,
            Err(e) => {
                log::warn!(target: "board", "Ignoring operation {} that doesn't decode: {e}", entry.id);
                return Ok(());
            }
        };
        // The commits an op relies on must be its git parents, not just named
        // in its trailers, so every peer evaluates it the same way.
        let parents = match cob::change::Storage::parents_of(repo, &op.id) {
            Ok(parents) => parents,
            Err(e) => {
                log::warn!(target: "board", "Ignoring operation {} whose parents don't load: {e}", op.id);
                return Ok(());
            }
        };
        if !op.identity.is_some_and(|head| parents.contains(&head)) {
            return Ok(());
        }
        let doc = match op.identity_doc(repo) {
            Ok(Some(doc)) => doc,
            Ok(None) => return Ok(()),
            Err(e) => {
                log::warn!(target: "board", "Ignoring operation {} without an identity: {e}", op.id);
                return Ok(());
            }
        };
        for action in op.actions {
            if authorized(self, &action, &op.author, &parents, &doc, repo) {
                self.apply_action(action, op.author, op.timestamp);
            } else {
                log::debug!(target: "board", "Ignoring unauthorized action in {}", op.id);
            }
        }

        Ok(())
    }
}

pub struct Boards<'a, R, A> {
    raw: store::Store<'a, Board, R, A>,
}

impl<'a, R, A> Deref for Boards<'a, R, A> {
    type Target = store::Store<'a, Board, R, A>;

    fn deref(&self) -> &Self::Target {
        &self.raw
    }
}

impl<'a, R, A> Boards<'a, R, A>
where
    R: ReadRepository + cob::Store<Namespace = NodeId>,
    A: access::Access + 'a,
{
    pub fn open(repository: &'a R, access: A) -> Result<Self, RepositoryError> {
        let identity = repository.identity_head()?;
        let raw = store::Store::open_for(&TYPENAME, repository, access)?.identity(identity);

        Ok(Self { raw })
    }

    /// Whether `card` may go on this repository's boards. A move writes the
    /// card's repository and id into the board's history for everyone who
    /// replicates it, so a private repository's cards only go on its own
    /// boards. The evaluator can't check this, so it's checked here, before
    /// writing.
    pub fn shareable<S: ReadStorage>(&self, storage: &S, card: &Card) -> Result<(), ShareError> {
        let rid = self.raw.as_ref().id();
        if card.rid == rid {
            return Ok(());
        }
        let private = storage
            .repository(card.rid)
            .and_then(|repo| Ok(repo.identity_doc()?.is_private()))
            .map_err(|_| ShareError::Unavailable(card.rid))?;
        if private {
            return Err(ShareError::Private(card.rid));
        }
        Ok(())
    }
}

impl<'a, R, A> Boards<'a, R, A>
where
    R: ReadRepository
        + cob::Store<Namespace = NodeId>
        + cob::change::Storage<
            ObjectId = Oid,
            Parent = Oid,
            PublicKey = crypto::PublicKey,
            Signature = crypto::Signature,
        >,
    A: access::Access + 'a,
{
    pub fn get(&self, id: &BoardId) -> Result<Option<Board>, store::Error> {
        self.raw.get(id)
    }

    pub fn list(&self) -> Result<Vec<(BoardId, Board)>, store::Error> {
        self.raw.all()?.collect()
    }

    /// Whether `author` may carry out `action` on `board` as of the
    /// repository's current identity.
    pub fn authorized(
        &self,
        board: &Board,
        action: &Action,
        author: &ActorId,
    ) -> Result<bool, RepositoryError> {
        let repo = self.raw.as_ref();
        let doc = repo.identity_doc()?;

        Ok(authorized(
            board,
            action,
            author,
            &action.parents(),
            &doc,
            repo,
        ))
    }

    /// A move of `card` that links the card's object when it lives in this
    /// repository.
    pub fn move_action(
        &self,
        card: Card,
        column: String,
        position: String,
        proof: Option<Oid>,
    ) -> Action {
        let local = card.rid == self.raw.as_ref().id();
        Action::Move {
            card,
            column,
            position,
            proof,
            local,
        }
    }
}

impl<'a, R, S> Boards<'a, R, access::WriteAs<'a, S>>
where
    R: WriteRepository
        + SignRepository
        + cob::Store<Namespace = NodeId>
        + cob::change::Storage<
            ObjectId = Oid,
            Parent = Oid,
            PublicKey = crypto::PublicKey,
            Signature = crypto::Signature,
        >,
    S: crypto::Signer,
{
    pub fn create(&mut self, name: &str) -> Result<(BoardId, Board), store::Error> {
        store::Transaction::initial("Create board", &mut self.raw, |tx, _| {
            tx.push(Action::Edit {
                name: name.to_string(),
            })
        })
    }

    pub fn rename(&mut self, id: &BoardId, name: &str) -> Result<Board, store::Error> {
        self.transact(
            id,
            "Rename board",
            vec![Action::Edit {
                name: name.to_string(),
            }],
        )
    }

    pub fn set_columns(
        &mut self,
        id: &BoardId,
        columns: Vec<Column>,
    ) -> Result<Board, store::Error> {
        self.transact(id, "Set board columns", vec![Action::Columns { columns }])
    }

    /// Applies `actions` as one operation, so they cost a single update of
    /// the signed refs. Refuses, writing nothing, if a move names a card
    /// that isn't [`shareable`](Self::shareable).
    pub fn update<T: ReadStorage>(
        &mut self,
        storage: &T,
        id: &BoardId,
        actions: Vec<Action>,
    ) -> Result<Board, UpdateError> {
        for action in &actions {
            if let Action::Move { card, .. } = action {
                self.shareable(storage, card)?;
            }
        }
        Ok(self.transact(id, "Update board", actions)?)
    }

    fn transact(
        &mut self,
        id: &BoardId,
        message: &str,
        actions: Vec<Action>,
    ) -> Result<Board, store::Error> {
        let mut tx = store::Transaction::<Board, R>::default();
        tx.extend(actions)?;
        let (board, _) = tx.commit(message, *id, &mut self.raw)?;

        Ok(board)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test;
