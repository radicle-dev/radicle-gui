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

use std::collections::{BTreeMap, HashMap};
use std::ops::Deref;
use std::rc::Rc;
use std::str::FromStr;
use std::sync::LazyLock;

use radicle::cob::store::{self, CobAction, CobWithType, access};
use radicle::cob::{self, ActorId, Evaluate, ObjectId, Op, Timestamp, TypeName};
use radicle::crypto;
use radicle::git::Oid;
use radicle::git::fmt::RefString;
use radicle::identity::{Did, DocAt, RepoId};
use radicle::node::NodeId;
use radicle::storage::git::Repository;
use radicle::storage::{
    ReadRepository, ReadStorage, RepositoryError, SignRepository, WriteRepository,
};
use serde::{Deserialize, Serialize};

#[cfg(feature = "sqlite")]
pub mod cache;
pub mod position;

#[cfg(feature = "sqlite")]
pub use cache::db_path as cache_db_path;

pub static TYPENAME: LazyLock<TypeName> =
    LazyLock::new(|| FromStr::from_str("works.monadic.board").expect("type name is valid"));

/// A glob of every board's references, across all namespaces. It has two
/// wildcards, so it is for git rather than heartwood's reference patterns.
pub static REFS: LazyLock<String> =
    LazyLock::new(|| format!("refs/namespaces/*/refs/cobs/{}/*", TYPENAME.as_str()));

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
    #[serde(with = "cards")]
    cards: BTreeMap<Card, Placement>,
}

/// Cards as a list of `[card, placement]` pairs, since JSON keys are strings.
mod cards {
    use std::collections::BTreeMap;

    use serde::{Deserialize, Deserializer, Serializer};

    use super::{Card, Placement};

    pub fn serialize<S: Serializer>(
        cards: &BTreeMap<Card, Placement>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        serializer.collect_seq(cards)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<BTreeMap<Card, Placement>, D::Error> {
        Vec::<(Card, Placement)>::deserialize(deserializer).map(|cards| cards.into_iter().collect())
    }
}

/// What one evaluation has loaded so far. An identity document is pinned by
/// its commit and a card's root by its id, so neither can read differently
/// later in the same evaluation.
#[derive(Default)]
struct Memo {
    docs: HashMap<Oid, Option<Rc<DocAt>>>,
    roots: HashMap<ObjectId, Option<(ActorId, TypeName)>>,
}

impl Memo {
    fn doc<R: ReadRepository>(&mut self, head: Oid, repo: &R) -> Option<Rc<DocAt>> {
        self.docs
            .entry(head)
            .or_insert_with(|| match repo.identity_doc_at(head) {
                Ok(doc) => Some(Rc::new(doc)),
                Err(e) => {
                    log::warn!(target: "board", "Ignoring operations with identity {head} that doesn't load: {e}");
                    None
                }
            })
            .clone()
    }

    /// The author and type of `oid` if it is a verified root operation.
    fn root<R>(&mut self, oid: ObjectId, repo: &R) -> Option<(ActorId, TypeName)>
    where
        R: cob::change::Storage<
                ObjectId = Oid,
                Parent = Oid,
                PublicKey = crypto::PublicKey,
                Signature = crypto::Signature,
            >,
    {
        self.roots
            .entry(oid)
            .or_insert_with(|| {
                let root = cob::change::Storage::load(repo, *oid).ok()?;
                if !root.valid_signatures() || !root.parents.is_empty() {
                    return None;
                }
                Some((*root.author(), root.manifest.type_name.clone()))
            })
            .clone()
    }
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
    memo: &mut Memo,
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

    let Some((root_author, type_name)) = memo.root(card.oid, repo) else {
        return false;
    };
    if type_name != card.type_name {
        return false;
    }
    if delegate || root_author == *author {
        return true;
    }

    // Others may only move a card between columns that do the same thing to
    // it, so the move can't close, reopen or change why an issue is closed.
    let source = board.placement(card).and_then(|p| board.closes(&p.column));
    if !issue || source != target {
        return false;
    }

    // The proof, too, has to travel with the op.
    proof.is_some_and(|proof| {
        parents.contains(&proof) && assigned(&card.oid, &proof, author, repo, memo)
    })
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
fn assigned<R>(issue: &Oid, proof: &Oid, author: &ActorId, repo: &R, memo: &mut Memo) -> bool
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
    let Some(doc) =
        linked_identity(*proof, op.identity, repo).and_then(|head| memo.doc(head, repo))
    else {
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
        Board::init(op, &doc)
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

impl Board {
    fn init(op: Op<Action>, doc: &DocAt) -> Result<Self, Error> {
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

    fn apply_entry<R>(&mut self, entry: &cob::Entry, repo: &R, memo: &mut Memo) -> Result<(), Error>
    where
        R: ReadRepository
            + cob::change::Storage<
                ObjectId = Oid,
                Parent = Oid,
                PublicKey = crypto::PublicKey,
                Signature = crypto::Signature,
            >,
    {
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
        let Some(doc) = op
            .identity
            .filter(|head| parents.contains(head))
            .and_then(|head| memo.doc(head, repo))
        else {
            return Ok(());
        };
        for action in op.actions {
            if authorized(self, &action, &op.author, &parents, &doc, repo, memo) {
                self.apply_action(action, op.author, op.timestamp);
            } else {
                log::debug!(target: "board", "Ignoring unauthorized action in {}", op.id);
            }
        }

        Ok(())
    }
}

fn init_entry<R: ReadRepository>(entry: &cob::Entry, repo: &R) -> Result<(Board, DocAt), Error> {
    // Checked before decoding, as a newer format's actions may not decode.
    if !supported(entry.manifest.version) {
        return Err(Error::Version(entry.manifest.version.into()));
    }
    let op = Op::try_from(entry)?;
    if linked_identity(op.id, op.identity, repo).is_none() {
        return Err(Error::MissingIdentity);
    }
    let doc = op.identity_doc(repo)?.ok_or(Error::MissingIdentity)?;
    let board = Board::init(op, &doc)?;

    Ok((board, doc))
}

/// The evaluator heartwood uses when it writes an operation. It loads every
/// linked object afresh; reads go through [`Memoised`].
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
        init_entry(entry, repo).map(|(board, _)| board)
    }

    fn apply<'a, I: Iterator<Item = (&'a cob::EntryId, &'a cob::Entry)>>(
        &mut self,
        entry: &cob::Entry,
        _concurrent: I,
        repo: &R,
    ) -> Result<(), Error> {
        self.apply_entry(entry, repo, &mut Memo::default())
    }
}

/// A board under evaluation, loading each identity document and card root
/// once. It reaches the same state as [`Board`]'s own evaluation.
struct Memoised {
    board: Board,
    memo: Memo,
}

impl<R> Evaluate<R> for Memoised
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
        let (board, doc) = init_entry(entry, repo)?;
        let mut memo = Memo::default();
        memo.docs.insert(doc.commit, Some(Rc::new(doc)));

        Ok(Self { board, memo })
    }

    fn apply<'a, I: Iterator<Item = (&'a cob::EntryId, &'a cob::Entry)>>(
        &mut self,
        entry: &cob::Entry,
        _concurrent: I,
        repo: &R,
    ) -> Result<(), Error> {
        self.board.apply_entry(entry, repo, &mut self.memo)
    }
}

/// The tips of every board's references, by board.
fn tips<R: AsRef<Repository>>(repo: &R) -> Result<BTreeMap<BoardId, Vec<Oid>>, store::Error> {
    let mut tips: BTreeMap<BoardId, Vec<Oid>> = BTreeMap::new();
    let refs = repo
        .as_ref()
        .backend
        .references_glob(&REFS)
        .map_err(store::Error::Git)?;
    for reference in refs {
        let reference = reference.map_err(store::Error::Git)?;
        let (Ok(name), Some(oid)) = (reference.name(), reference.target()) else {
            continue;
        };
        let Ok(name) = RefString::try_from(name) else {
            continue;
        };
        if let Some((_, id)) = cob::object::parse_refstr(&name) {
            tips.entry(id).or_default().push(oid.into());
        }
    }

    Ok(tips)
}

#[cfg(feature = "sqlite")]
fn tips_of<R: ReadRepository>(repo: &R, id: &BoardId) -> Result<Vec<Oid>, store::Error> {
    let pattern = radicle::git::refs::storage::cobs(&TYPENAME, id);
    let refs = repo.references_glob(&pattern).map_err(store::Error::Git)?;

    Ok(refs.into_iter().map(|(_, oid)| oid).collect())
}

pub struct Boards<'a, R, A> {
    raw: store::Store<'a, Board, R, A>,
    #[cfg(feature = "sqlite")]
    cache: Option<cache::Store>,
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

        Ok(Self {
            raw,
            #[cfg(feature = "sqlite")]
            cache: None,
        })
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

    /// Opens the boards with a cache of evaluated boards at `path`, which
    /// serves reads whose board hasn't changed and takes our own writes. If
    /// the cache can't be opened, reads evaluate from git.
    #[cfg(feature = "sqlite")]
    pub fn open_cached(
        repository: &'a R,
        access: A,
        path: impl AsRef<std::path::Path>,
    ) -> Result<Self, RepositoryError> {
        let mut boards = Self::open(repository, access)?;
        match cache::Store::open(path) {
            Ok(cache) => boards.cache = Some(cache),
            Err(e) => log::warn!(target: "board", "Board cache disabled: {e}"),
        }

        Ok(boards)
    }
}

impl<'a, R, A> Boards<'a, R, A>
where
    R: ReadRepository
        + AsRef<Repository>
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
        #[cfg(feature = "sqlite")]
        if let Some(cache) = &self.cache {
            match self.cached_get(cache, id) {
                Ok(board) => return Ok(board),
                Err(CacheError::Store(e)) => return Err(e),
                Err(CacheError::Cache(e)) => {
                    log::warn!(target: "board", "Board cache failed, evaluating from git: {e}");
                }
            }
        }
        self.evaluate(id)
    }

    pub fn list(&self) -> Result<Vec<(BoardId, Board)>, store::Error> {
        #[cfg(feature = "sqlite")]
        if let Some(cache) = &self.cache {
            match self.cached_list(cache) {
                Ok(boards) => return Ok(boards),
                Err(CacheError::Store(e)) => return Err(e),
                Err(CacheError::Cache(e)) => {
                    log::warn!(target: "board", "Board cache failed, evaluating from git: {e}");
                }
            }
        }
        let mut boards = Vec::new();
        for id in tips(self.raw.as_ref())?.keys() {
            if let Some(board) = self.evaluate_or_skip(id) {
                boards.push((*id, board));
            }
        }

        Ok(boards)
    }

    fn evaluate(&self, id: &BoardId) -> Result<Option<Board>, store::Error> {
        let cob = cob::get::<Memoised, _>(self.raw.as_ref(), &TYPENAME, id)?;

        Ok(cob.map(|cob| cob.object.board))
    }

    /// A board that fails to evaluate is left out, as heartwood's listing
    /// leaves out such objects.
    fn evaluate_or_skip(&self, id: &BoardId) -> Option<Board> {
        match self.evaluate(id) {
            Ok(board) => board,
            Err(e) => {
                log::debug!(target: "board", "Leaving out board {id} that doesn't evaluate: {e}");
                None
            }
        }
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
            &mut Memo::default(),
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

#[cfg(feature = "sqlite")]
enum CacheError {
    Store(store::Error),
    Cache(cache::Error),
}

#[cfg(feature = "sqlite")]
impl From<cache::Error> for CacheError {
    fn from(e: cache::Error) -> Self {
        Self::Cache(e)
    }
}

/// The board of a cached row that is current and reads.
#[cfg(feature = "sqlite")]
fn fresh(row: Option<cache::Row>, token: &str) -> Option<Board> {
    let row = row?;
    if row.head != token {
        return None;
    }
    serde_json::from_str(&row.board).ok()
}

#[cfg(feature = "sqlite")]
impl<'a, R, A> Boards<'a, R, A>
where
    R: ReadRepository
        + AsRef<Repository>
        + cob::Store<Namespace = NodeId>
        + cob::change::Storage<
            ObjectId = Oid,
            Parent = Oid,
            PublicKey = crypto::PublicKey,
            Signature = crypto::Signature,
        >,
    A: access::Access + 'a,
{
    fn cached_get(&self, cache: &cache::Store, id: &BoardId) -> Result<Option<Board>, CacheError> {
        let repo = self.raw.as_ref();
        let rid = repo.id();
        let tips = tips_of(repo, id).map_err(CacheError::Store)?;
        if tips.is_empty() {
            cache.remove(&rid, id)?;
            return Ok(None);
        }
        let token = cache::head_token(&tips);
        if let Some(board) = fresh(cache.get(&rid, id)?, &token) {
            return Ok(Some(board));
        }
        let board = self.evaluate(id).map_err(CacheError::Store)?;
        match &board {
            Some(board) => cache.update(&rid, id, &token, board)?,
            None => cache.remove(&rid, id)?,
        }

        Ok(board)
    }

    fn cached_list(&self, cache: &cache::Store) -> Result<Vec<(BoardId, Board)>, CacheError> {
        let repo = self.raw.as_ref();
        let rid = repo.id();
        let current = tips(repo).map_err(CacheError::Store)?;
        let mut rows: HashMap<BoardId, cache::Row> = cache.rows(&rid)?.into_iter().collect();
        let mut boards = Vec::new();
        for (id, tips) in &current {
            let token = cache::head_token(tips);
            if let Some(board) = fresh(rows.remove(id), &token) {
                boards.push((*id, board));
                continue;
            }
            match self.evaluate_or_skip(id) {
                Some(board) => {
                    cache.update(&rid, id, &token, &board)?;
                    boards.push((*id, board));
                }
                None => cache.remove(&rid, id)?,
            }
        }
        for id in rows.keys() {
            cache.remove(&rid, id)?;
        }

        Ok(boards)
    }

    /// Stores a board we wrote, unless another namespace's tip changed in the
    /// meantime: then the next read evaluates it with that change.
    fn remember(&self, id: &BoardId, before: &[Oid], head: Oid, board: &Board) {
        let Some(cache) = &self.cache else {
            return;
        };
        let repo = self.raw.as_ref();
        let result = tips_of(repo, id)
            .map_err(CacheError::Store)
            .and_then(|after| {
                let expected = after.contains(&head)
                    && after.iter().all(|tip| *tip == head || before.contains(tip));
                if !expected {
                    return Ok(());
                }
                Ok(cache.update(&repo.id(), id, &cache::head_token(&after), board)?)
            });
        match result {
            Ok(()) => {}
            Err(CacheError::Store(e)) => {
                log::warn!(target: "board", "Board cache write skipped: {e}");
            }
            Err(CacheError::Cache(e)) => {
                log::warn!(target: "board", "Board cache write failed: {e}");
            }
        }
    }
}

impl<'a, R, S> Boards<'a, R, access::WriteAs<'a, S>>
where
    R: WriteRepository
        + SignRepository
        + AsRef<Repository>
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
        let (id, board) = store::Transaction::initial("Create board", &mut self.raw, |tx, _| {
            tx.push(Action::Edit {
                name: name.to_string(),
            })
        })?;
        #[cfg(feature = "sqlite")]
        self.remember(&id, &[], *id, &board);

        Ok((id, board))
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
        #[cfg(feature = "sqlite")]
        let before = tips_of(self.raw.as_ref(), id)?;
        let (board, head) = tx.commit(message, *id, &mut self.raw)?;
        #[cfg(feature = "sqlite")]
        self.remember(id, &before, head, &board);
        #[cfg(not(feature = "sqlite"))]
        let _ = head;

        Ok(board)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test;
