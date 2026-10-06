use radicle::cob::store::access::{ReadOnly, WriteAs};
use radicle::cob::{self, ObjectId, Op};
use radicle::git::Oid;
use radicle::identity::{Did, RepoId};
use radicle::issue::cache::Issues as _;
use radicle::node::{Handle, Node};
use radicle::patch::cache::Patches as _;
use radicle::storage::{ReadRepository, ReadStorage};
use radicle_board::{Boards as BoardStore, position};

use crate::cobs;
use crate::cobs::board::{Board, Card, Column, PatchLink, mentioned_issues};
use crate::error::Error;
use crate::traits::Profile;

pub trait Boards: Profile {
    fn list_boards(&self, rid: RepoId) -> Result<Vec<Board>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let aliases = profile.aliases();
        let boards = BoardStore::open(&repo, ReadOnly)?;

        let mut boards = boards
            .list()?
            .into_iter()
            .map(|(id, board)| Board::new(id, &board, &aliases))
            .collect::<Vec<_>>();
        boards.sort_by(|a, b| {
            a.created_at
                .cmp(&b.created_at)
                .then_with(|| a.id.cmp(&b.id))
        });

        Ok(boards)
    }

    fn create_board(
        &self,
        rid: RepoId,
        name: String,
        opts: cobs::CobOptions,
    ) -> Result<Board, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut boards = BoardStore::open(&repo, WriteAs::new(&signer))?;
        let (id, board) = boards.create(name.trim())?;
        announce(&profile, rid, &opts);

        Ok(Board::new(id, &board, &aliases))
    }

    /// Place `card` in `column` between the cards at positions `before` and
    /// `after`, where `None` is the start or end of the column.
    #[allow(clippy::too_many_arguments)]
    fn move_card(
        &self,
        rid: RepoId,
        board: ObjectId,
        card: Card,
        column: String,
        before: Option<String>,
        after: Option<String>,
        opts: cobs::CobOptions,
    ) -> Result<Board, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let position = position::between(before.as_deref(), after.as_deref())
            .ok_or(Error::Board("invalid card position"))?;
        let card: radicle_board::Card = card.into();
        if card.rid != rid {
            // A board never names a private repository other than its own.
            let source = profile
                .storage
                .repository(card.rid)
                .map_err(|_| Error::Board("the card's repository isn't available locally"))?;
            if source.identity_doc()?.is_private() {
                return Err(Error::Board(
                    "cards from private repositories can only go on their own repository's boards",
                ));
            }
        }
        let proof = assignment(&repo, &card, &Did::from(profile.public_key));

        let mut boards = BoardStore::open(&repo, WriteAs::new(&signer))?;
        let updated = boards.move_card(
            &board,
            card.clone(),
            column.clone(),
            position.clone(),
            proof,
        )?;
        let placed = updated
            .placement(&card)
            .is_some_and(|p| p.column == column && p.position == position);
        if !placed {
            return Err(Error::Board("you are not allowed to move this card"));
        }
        announce(&profile, rid, &opts);

        Ok(Board::new(board, &updated, &aliases))
    }

    fn board_links(&self, rid: RepoId) -> Result<Vec<PatchLink>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let issues = profile
            .issues(&repo)?
            .list()?
            .filter_map(|issue| issue.ok().map(|(id, _)| id))
            .collect::<Vec<_>>();

        Ok(profile
            .patches(&repo)?
            .list()?
            .filter_map(Result::ok)
            .filter_map(|(id, patch)| {
                let text = format!("{}\n{}", patch.title(), patch.description());
                let issues = mentioned_issues(&text, &issues);
                (!issues.is_empty()).then_some(PatchLink { patch: id, issues })
            })
            .collect())
    }

    fn rename_board(
        &self,
        rid: RepoId,
        board: ObjectId,
        name: String,
        opts: cobs::CobOptions,
    ) -> Result<Board, Error> {
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::Board("a board needs a name"));
        }
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut boards = BoardStore::open(&repo, WriteAs::new(&signer))?;
        let updated = boards.rename(&board, name)?;
        if updated.name() != name {
            return Err(Error::Board("only delegates can rename a board"));
        }
        announce(&profile, rid, &opts);

        Ok(Board::new(board, &updated, &aliases))
    }

    fn set_board_columns(
        &self,
        rid: RepoId,
        board: ObjectId,
        columns: Vec<Column>,
        opts: cobs::CobOptions,
    ) -> Result<Board, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let columns: Vec<radicle_board::Column> = columns.into_iter().map(Into::into).collect();
        let mut boards = BoardStore::open(&repo, WriteAs::new(&signer))?;
        let updated = boards.set_columns(&board, columns.clone())?;
        if updated.columns() != columns.as_slice() {
            return Err(Error::Board("those columns weren't accepted"));
        }
        announce(&profile, rid, &opts);

        Ok(Board::new(board, &updated, &aliases))
    }

    fn remove_card(
        &self,
        rid: RepoId,
        board: ObjectId,
        card: Card,
        opts: cobs::CobOptions,
    ) -> Result<Board, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut boards = BoardStore::open(&repo, WriteAs::new(&signer))?;
        let updated = boards.remove_card(&board, card.into())?;
        announce(&profile, rid, &opts);

        Ok(Board::new(board, &updated, &aliases))
    }
}

/// The latest operation in which a delegate assigned `me` to the card's issue,
/// for when neither delegation nor authorship lets us move the card.
fn assignment<R: ReadRepository + cob::Store>(
    repo: &R,
    card: &radicle_board::Card,
    me: &Did,
) -> Option<Oid> {
    if card.rid != repo.id() || card.type_name != *cob::issue::TYPENAME {
        return None;
    }
    if repo.identity_doc().ok()?.is_delegate(me) {
        return None;
    }
    let ops = cob::store::ops(&card.oid, &cob::issue::TYPENAME, repo).ok()?;
    if Did::from(ops.first().author) == *me {
        return None;
    }

    ops.into_iter()
        .filter(|op: &Op<Vec<u8>>| {
            op.identity_doc(repo)
                .ok()
                .flatten()
                .is_some_and(|doc| doc.is_delegate(&Did::from(op.author)))
        })
        .filter(|op| {
            op.actions.iter().any(|bytes| {
                matches!(
                    serde_json::from_slice::<cob::issue::Action>(bytes),
                    Ok(cob::issue::Action::Assign { assignees }) if assignees.contains(me)
                )
            })
        })
        .map(|op| op.id)
        .last()
}

fn announce(profile: &radicle::Profile, rid: RepoId, opts: &cobs::CobOptions) {
    let mut node = Node::new(profile.home().socket_from_env());
    if opts.announce()
        && let Err(e) = node.announce_refs_for(rid, [profile.public_key])
    {
        log::error!("Not able to announce changes: {}", e)
    }
}
