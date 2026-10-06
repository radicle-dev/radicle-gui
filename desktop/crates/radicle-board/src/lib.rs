//! A board collaborative object.
//!
//! A board arranges a repository's issues and patches in columns. It stores
//! only placement: which column a card sits in and where in that column.
//! Titles, state and labels come from the cards' own objects.
//!
//! Delegates may change anything on a board. A card may also be moved by the
//! author of the issue or patch it shows, and by anyone a delegate assigned to
//! that issue. An assignee proves the assignment by naming the issue operation
//! that assigned them. Every operation a check reads is linked from the board
//! operation, so it travels with the board and every peer reaches the same
//! verdict. Operations that fail the checks are ignored rather than rejected,
//! so they can't cause later operations to be dropped.
//!
//! The format is unstable until the type name loses its `.unstable` suffix.

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
use radicle::storage::{ReadRepository, RepositoryError, SignRepository, WriteRepository};
use serde::{Deserialize, Serialize};

pub mod position;

pub static TYPENAME: LazyLock<TypeName> =
    LazyLock::new(|| FromStr::from_str("dev.radicle.board.unstable").expect("type name is valid"));

pub type BoardId = ObjectId;

/// An issue or patch shown on a board, in any repository.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Card {
    pub rid: RepoId,
    #[serde(rename = "type")]
    pub type_name: TypeName,
    pub oid: ObjectId,
}

/// What dropping an issue into a column does to it.
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

/// The columns a new board starts with.
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
    /// Replace the board's columns.
    #[serde(rename = "columns")]
    Columns { columns: Vec<Column> },
    /// Place a card in a column, at a position from [`position::between`].
    #[serde(rename = "move")]
    Move {
        card: Card,
        column: String,
        position: String,
        /// The issue operation that assigned the mover to the card's issue.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        proof: Option<Oid>,
        /// Whether the card's object lives in the board's repository. Only
        /// used when the operation is created, to link that object.
        #[serde(skip)]
        local: bool,
    },
    /// Take a card off the board.
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
    #[error("invalid board: {0}")]
    Invalid(&'static str),
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

    /// Cards in board order: by column, then by position, with ties broken by
    /// card so that concurrent moves to the same position settle the same way
    /// everywhere. Cards whose column no longer exists are left out.
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

    fn valid_columns(columns: &[Column]) -> bool {
        !columns.is_empty()
            && columns
                .iter()
                .all(|c| !c.id.is_empty() && !c.name.is_empty())
            && columns
                .iter()
                .enumerate()
                .all(|(i, c)| columns[..i].iter().all(|d| d.id != c.id))
    }

    fn apply_action(&mut self, action: Action, author: ActorId, timestamp: Timestamp) {
        match action {
            Action::Edit { name } => {
                if !name.is_empty() {
                    self.name = name;
                }
            }
            Action::Columns { columns } => {
                if Self::valid_columns(&columns) {
                    self.columns = columns;
                }
            }
            Action::Move {
                card,
                column,
                position,
                ..
            } => {
                if position::is_valid(&position) && self.columns.iter().any(|c| c.id == column) {
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

/// Whether `author` may carry out `action` on a board in `repo`.
fn authorized<R>(action: &Action, author: &ActorId, doc: &DocAt, repo: &R) -> bool
where
    R: ReadRepository
        + cob::change::Storage<
            ObjectId = Oid,
            Parent = Oid,
            PublicKey = crypto::PublicKey,
            Signature = crypto::Signature,
        >,
{
    if doc.is_delegate(&Did::from(*author)) {
        return true;
    }
    let Action::Move { card, proof, .. } = action else {
        return false;
    };
    if card.rid != repo.id() {
        return false;
    }

    let Ok(root) = Op::<serde_json::Value>::load(repo, *card.oid) else {
        return false;
    };
    if root.manifest.type_name != card.type_name {
        return false;
    }
    if root.author == *author {
        return true;
    }

    proof.is_some_and(|proof| assigned(&card.oid, &proof, author, repo))
}

/// Whether `proof` is an operation of the issue `issue` in which a delegate
/// assigned `author`.
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
    let Ok(op) = Op::<cob::issue::Action>::load(repo, *proof) else {
        return false;
    };
    if op.manifest.type_name != *cob::issue::TYPENAME {
        return false;
    }
    if proof != issue && !matches!(repo.is_ancestor_of(*issue, *proof), Ok(true)) {
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
        let doc = op.identity_doc(repo)?.ok_or(Error::MissingIdentity)?;
        if !doc.is_delegate(&Did::from(op.author)) {
            return Err(Error::NotDelegate);
        }
        let mut actions = op.actions.into_iter();
        let Some(Action::Edit { name }) = actions.next() else {
            return Err(Error::Init);
        };
        if name.is_empty() {
            return Err(Error::Invalid("the board name is empty"));
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
        // Applying an operation needs to read the objects it links to, which
        // `ReadRepository` alone doesn't allow; see `Evaluate::apply`.
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
        let op = Op::try_from(entry)?;
        <Board as store::Cob>::from_root(op, repo)
    }

    fn apply<'a, I: Iterator<Item = (&'a cob::EntryId, &'a cob::Entry)>>(
        &mut self,
        entry: &cob::Entry,
        _concurrent: I,
        repo: &R,
    ) -> Result<(), Error> {
        let op = Op::<Action>::try_from(entry)?;
        let Some(doc) = op.identity_doc(repo)? else {
            return Ok(());
        };
        for action in op.actions {
            if authorized(&action, &op.author, &doc, repo) {
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

    pub fn move_card(
        &mut self,
        id: &BoardId,
        card: Card,
        column: String,
        position: String,
        proof: Option<Oid>,
    ) -> Result<Board, store::Error> {
        let local = card.rid == self.raw.as_ref().id();
        self.transact(
            id,
            "Move card",
            Action::Move {
                card,
                column,
                position,
                proof,
                local,
            },
        )
    }

    pub fn rename(&mut self, id: &BoardId, name: &str) -> Result<Board, store::Error> {
        self.transact(
            id,
            "Rename board",
            Action::Edit {
                name: name.to_string(),
            },
        )
    }

    pub fn remove_card(&mut self, id: &BoardId, card: Card) -> Result<Board, store::Error> {
        self.transact(id, "Remove card", Action::Remove { card })
    }

    pub fn set_columns(
        &mut self,
        id: &BoardId,
        columns: Vec<Column>,
    ) -> Result<Board, store::Error> {
        self.transact(id, "Set board columns", Action::Columns { columns })
    }

    fn transact(
        &mut self,
        id: &BoardId,
        message: &str,
        action: Action,
    ) -> Result<Board, store::Error> {
        let mut tx = store::Transaction::<Board, R>::default();
        tx.push(action)?;
        let (board, _) = tx.commit(message, *id, &mut self.raw)?;

        Ok(board)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test;
