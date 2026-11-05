use std::collections::HashSet;

use radicle::cob::store::access::{ReadOnly, WriteAs};
use radicle::cob::{self, ObjectId, Op};
use radicle::git::Oid;
use radicle::identity::{Did, RepoId};
use radicle::issue::cache::Issues as _;
use radicle::node::{Handle, Node};
use radicle::patch::cache::Patches as _;
use radicle::storage::{ReadRepository, ReadStorage};
use radicle_board::{
    Boards as BoardStore, MAX_COLUMN_ID_LEN, MAX_NAME_LEN, MAX_POSITION_LEN, cache_db_path,
    position,
};

use crate::cobs;
use crate::cobs::board::{Board, BoardUpdate, Card, CardMove, Column, PatchLink, linked_issues};
use crate::error::Error;
use crate::traits::Profile;

pub trait Boards: Profile {
    fn list_boards(&self, rid: RepoId) -> Result<Vec<Board>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let aliases = profile.aliases();
        let boards = BoardStore::open_cached(&repo, ReadOnly, cache_db_path(profile.cobs()))?;

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
        let name = valid_name(&name)?;
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        if !repo
            .identity_doc()?
            .is_delegate(&Did::from(profile.public_key))
        {
            return Err(Error::Board("only delegates can create a board"));
        }
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut boards =
            BoardStore::open_cached(&repo, WriteAs::new(&signer), cache_db_path(profile.cobs()))?;
        let (id, board) = boards.create(name)?;
        announce(&profile, rid, &opts);

        Ok(Board::new(id, &board, &aliases))
    }

    /// Apply a batch of card moves and removals as one operation, so a burst
    /// of changes costs a single update of the signed refs. Changes we aren't
    /// allowed to make are left out before writing and returned as rejected.
    fn update_board(
        &self,
        rid: RepoId,
        board: ObjectId,
        moves: Vec<CardMove>,
        removes: Vec<Card>,
        opts: cobs::CobOptions,
    ) -> Result<BoardUpdate, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let me = profile.public_key;

        let mut boards =
            BoardStore::open_cached(&repo, WriteAs::new(&signer), cache_db_path(profile.cobs()))?;
        let current = boards
            .get(&board)?
            .ok_or(Error::Board("the board doesn't exist"))?;
        let mut actions = Vec::new();
        let mut expected = Vec::new();
        let mut rejected = Vec::new();

        for CardMove {
            card,
            column,
            position,
        } in moves
        {
            let target: radicle_board::Card = card.clone().into();
            if !position::is_valid(&position)
                || position.len() > MAX_POSITION_LEN
                || column.is_empty()
                || column.len() > MAX_COLUMN_ID_LEN
                || boards.shareable(&profile.storage, &target).is_err()
            {
                rejected.push(card);
                continue;
            }
            let proof = assignment(&repo, &target, &Did::from(me));
            let action =
                boards.move_action(target.clone(), column.clone(), position.clone(), proof);
            if !boards.authorized(&current, &action, &me)? {
                rejected.push(card);
                continue;
            }
            actions.push(action);
            expected.push((card, target, Some((column, position))));
        }
        for card in removes {
            let target: radicle_board::Card = card.clone().into();
            let action = radicle_board::Action::Remove {
                card: target.clone(),
            };
            if !boards.authorized(&current, &action, &me)? {
                rejected.push(card);
                continue;
            }
            actions.push(action);
            expected.push((card, target, None));
        }

        let updated = if actions.is_empty() {
            current
        } else {
            let updated = boards.update(&profile.storage, &board, actions)?;
            announce(&profile, rid, &opts);
            updated
        };
        for (card, target, placement) in expected {
            let applied = match placement {
                Some((column, position)) => updated
                    .placement(&target)
                    .is_some_and(|p| p.column == column && p.position == position),
                None => updated.placement(&target).is_none(),
            };
            if !applied {
                rejected.push(card);
            }
        }

        Ok(BoardUpdate {
            board: Board::new(board, &updated, &aliases),
            rejected,
        })
    }

    /// The issues each patch links to; see [`linked_issues`]. Links to
    /// issues that don't exist are left out.
    fn board_links(&self, rid: RepoId) -> Result<Vec<PatchLink>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let issues = profile
            .issues(&repo)?
            .list()?
            .filter_map(|issue| issue.ok().map(|(id, _)| id))
            .collect::<HashSet<_>>();

        Ok(profile
            .patches(&repo)?
            .list()?
            .filter_map(Result::ok)
            .filter_map(|(id, patch)| {
                let text = format!("{}\n{}", patch.title(), patch.description());
                let issues: Vec<_> = linked_issues(&text, rid)
                    .into_iter()
                    .filter(|issue| issues.contains(issue))
                    .collect();
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
        let name = valid_name(&name)?;
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut boards =
            BoardStore::open_cached(&repo, WriteAs::new(&signer), cache_db_path(profile.cobs()))?;
        let current = boards
            .get(&board)?
            .ok_or(Error::Board("the board doesn't exist"))?;
        let action = radicle_board::Action::Edit {
            name: name.to_string(),
        };
        if !boards.authorized(&current, &action, &profile.public_key)? {
            return Err(Error::Board("only delegates can rename a board"));
        }
        let updated = boards.rename(&board, name)?;
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
        let columns: Vec<radicle_board::Column> = columns.into_iter().map(Into::into).collect();
        if !radicle_board::valid_columns(&columns) {
            return Err(Error::Board(
                "a board has 1 to 50 columns, each with a distinct id and a name of up to 100 bytes",
            ));
        }
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut boards =
            BoardStore::open_cached(&repo, WriteAs::new(&signer), cache_db_path(profile.cobs()))?;
        let current = boards
            .get(&board)?
            .ok_or(Error::Board("the board doesn't exist"))?;
        let action = radicle_board::Action::Columns {
            columns: columns.clone(),
        };
        if !boards.authorized(&current, &action, &profile.public_key)? {
            return Err(Error::Board("only delegates can change the columns"));
        }
        let updated = boards.set_columns(&board, columns.clone())?;
        if updated.columns() != columns.as_slice() {
            return Err(Error::Board("those columns weren't accepted"));
        }
        announce(&profile, rid, &opts);

        Ok(Board::new(board, &updated, &aliases))
    }
}

fn valid_name(name: &str) -> Result<&str, Error> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::Board("a board needs a name"));
    }
    if name.len() > MAX_NAME_LEN {
        return Err(Error::Board("the board name is too long"));
    }
    Ok(name)
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

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use radicle::cob::cache::NoCache;
    use radicle::cob::issue::Issues;
    use radicle::cob::store::access::{ReadOnly, WriteAs};
    use radicle::cob::{ObjectId, Title};
    use radicle::crypto::{Seed, Signer as _, SigningKey};
    use radicle::identity::{Did, RepoId, Visibility};
    use radicle::node::config::Network;
    use radicle::storage::{ReadRepository, ReadStorage};
    use radicle::test::fixtures;

    use super::Boards;
    use crate::cobs::CobOptions;
    use crate::cobs::board::{Card, CardMove, Column};
    use crate::{AppState, test};

    const SEED: [u8; 32] = [0xff; 32];
    const OTHER_SEED: [u8; 32] = [0xee; 32];

    fn quiet() -> CobOptions {
        serde_json::from_value(serde_json::json!({ "announce": false })).unwrap()
    }

    fn setup(tmp: &std::path::Path, network: Network) -> (AppState, RepoId) {
        setup_as(tmp, network, SEED)
    }

    /// A profile for `SEED` with a project whose delegate is `delegate`.
    fn setup_as(tmp: &std::path::Path, network: Network, delegate: [u8; 32]) -> (AppState, RepoId) {
        let mut profile = test::profile(&tmp.join("home"), SEED);
        profile.config.node.network = network;
        let signer = SigningKey::from_seed(Seed::new(delegate));
        let (rid, _, _, _) =
            fixtures::project(tmp.join("project"), &profile.storage, &signer).unwrap();
        (AppState { profile }, rid)
    }

    /// A private repository with `SEED` as its delegate, next to the project.
    fn private_project(tmp: &std::path::Path, state: &AppState) -> RepoId {
        let signer = SigningKey::from_seed(Seed::new(SEED));
        let (working, _) = fixtures::repository(tmp.join("private"));
        let (rid, _, _) = radicle::rad::init(
            &working,
            "secret".try_into().unwrap(),
            "A private repository",
            "master".try_into().unwrap(),
            Visibility::private([]),
            &signer,
            &state.profile.storage,
        )
        .unwrap();
        rid
    }

    fn open_issue(state: &AppState, rid: RepoId, title: &str) -> Card {
        open_issue_as(state, rid, title, SEED)
    }

    fn open_issue_as(state: &AppState, rid: RepoId, title: &str, seed: [u8; 32]) -> Card {
        let repo = state.profile.storage.repository(rid).unwrap();
        let signer = SigningKey::from_seed(Seed::new(seed));
        let mut issues = Issues::open(&repo, WriteAs::new(&signer)).unwrap();
        let mut cache = NoCache;
        let issue = issues
            .create(Title::new(title).unwrap(), "", &[], &[], [], &mut cache)
            .unwrap();
        let oid = *issue.id();
        Card {
            rid,
            type_name: radicle::cob::issue::TYPENAME.clone(),
            oid,
        }
    }

    fn moved(card: &Card, column: &str, position: &str) -> CardMove {
        CardMove {
            card: card.clone(),
            column: column.into(),
            position: position.into(),
        }
    }

    fn ops(state: &AppState, rid: RepoId, board: ObjectId) -> usize {
        let repo = state.profile.storage.repository(rid).unwrap();
        radicle::cob::store::ops(&board, &radicle_board::TYPENAME, &repo)
            .unwrap()
            .len()
    }

    fn sigrefs(state: &AppState, rid: RepoId) -> radicle::git::raw::Oid {
        let repo = state.profile.storage.repository(rid).unwrap();
        let signer = SigningKey::from_seed(Seed::new(SEED));
        repo.backend
            .refname_to_id(&format!(
                "refs/namespaces/{}/refs/rad/sigrefs",
                signer.public_key()
            ))
            .unwrap()
    }

    #[test]
    fn update_board_writes_a_batch_as_one_operation() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid) = setup(tmp.path(), Network::Test);
        let a = open_issue(&state, rid, "First");
        let b = open_issue(&state, rid, "Second");
        let board = state.create_board(rid, "Roadmap".into(), quiet()).unwrap();
        let before = sigrefs(&state, rid);

        let update = state
            .update_board(
                rid,
                board.id,
                vec![moved(&a, "todo", "V"), moved(&b, "done", "V")],
                vec![],
                quiet(),
            )
            .unwrap();

        assert!(update.rejected.is_empty());
        assert_eq!(update.board.cards.len(), 2);
        assert_eq!(ops(&state, rid, board.id), 2);
        assert_ne!(sigrefs(&state, rid), before);

        let update = state
            .update_board(rid, board.id, vec![], vec![a.clone()], quiet())
            .unwrap();
        assert!(update.rejected.is_empty());
        assert_eq!(update.board.cards.len(), 1);
        assert_eq!(update.board.cards[0].card, b);
    }

    #[test]
    fn update_board_rejects_changes_it_cannot_make() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid) = setup(tmp.path(), Network::Test);
        let a = open_issue(&state, rid, "First");
        let board = state.create_board(rid, "Roadmap".into(), quiet()).unwrap();
        let unknown_repo = Card {
            rid: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5".parse().unwrap(),
            ..a.clone()
        };
        let before = sigrefs(&state, rid);

        let update = state
            .update_board(
                rid,
                board.id,
                vec![
                    moved(&a, "", "V"),
                    moved(&a, "todo", "V0"),
                    moved(&unknown_repo, "todo", "V"),
                ],
                vec![],
                quiet(),
            )
            .unwrap();

        assert_eq!(update.rejected, vec![a.clone(), a, unknown_repo]);
        assert!(update.board.cards.is_empty());
        assert_eq!(ops(&state, rid, board.id), 1);
        assert_eq!(sigrefs(&state, rid), before);
    }

    #[test]
    fn a_non_delegate_rename_or_column_change_writes_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid) = setup_as(tmp.path(), Network::Test, OTHER_SEED);
        let delegate = SigningKey::from_seed(Seed::new(OTHER_SEED));
        let repo = state.profile.storage.repository(rid).unwrap();
        let (board, _) = radicle_board::Boards::open(&repo, WriteAs::new(&delegate))
            .unwrap()
            .create("Roadmap")
            .unwrap();

        let err = state
            .rename_board(rid, board, "Mine".into(), quiet())
            .unwrap_err();
        assert_eq!(err.code(), "BoardError");
        let err = state
            .set_board_columns(
                rid,
                board,
                vec![Column {
                    id: "mine".into(),
                    name: "Mine".into(),
                    closes: None,
                }],
                quiet(),
            )
            .unwrap_err();
        assert_eq!(err.code(), "BoardError");
        assert_eq!(ops(&state, rid, board), 1);
    }

    #[test]
    fn duplicate_column_ids_write_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid) = setup(tmp.path(), Network::Test);
        let board = state.create_board(rid, "Roadmap".into(), quiet()).unwrap();
        let before = sigrefs(&state, rid);
        let column = |name: &str| Column {
            id: "twice".into(),
            name: name.into(),
            closes: None,
        };

        let err = state
            .set_board_columns(rid, board.id, vec![column("One"), column("Two")], quiet())
            .unwrap_err();

        assert_eq!(err.code(), "BoardError");
        assert_eq!(ops(&state, rid, board.id), 1);
        assert_eq!(sigrefs(&state, rid), before);
    }

    #[test]
    fn update_board_links_the_latest_assignment_as_proof() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid) = setup_as(tmp.path(), Network::Test, OTHER_SEED);
        let delegate = SigningKey::from_seed(Seed::new(OTHER_SEED));
        let me = Did::from(state.profile.public_key);
        let card = open_issue_as(&state, rid, "Delegate's issue", OTHER_SEED);
        let repo = state.profile.storage.repository(rid).unwrap();
        let mut issues = Issues::open(&repo, WriteAs::new(&delegate)).unwrap();
        let mut cache = NoCache;
        let mut issue = issues.get_mut(&card.oid, &mut cache).unwrap();
        let first = issue.assign([me]).unwrap();
        issue.assign([]).unwrap();
        let latest = issue.assign([me]).unwrap();
        let (board, _) = radicle_board::Boards::open(&repo, WriteAs::new(&delegate))
            .unwrap()
            .create("Roadmap")
            .unwrap();

        let update = state
            .update_board(rid, board, vec![moved(&card, "todo", "V")], vec![], quiet())
            .unwrap();

        assert!(update.rejected.is_empty());
        assert_eq!(update.board.cards[0].column, "todo");
        let ops = radicle::cob::store::ops(&board, &radicle_board::TYPENAME, &repo).unwrap();
        let related = &ops.last().related;
        assert!(related.contains(&latest));
        assert!(!related.contains(&first));
    }

    #[test]
    fn a_private_repositorys_card_stays_off_other_boards() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid) = setup(tmp.path(), Network::Test);
        let private = private_project(tmp.path(), &state);
        let secret = open_issue(&state, private, "Secret");
        let board = state.create_board(rid, "Roadmap".into(), quiet()).unwrap();
        let before = sigrefs(&state, rid);

        let update = state
            .update_board(
                rid,
                board.id,
                vec![moved(&secret, "todo", "V")],
                vec![],
                quiet(),
            )
            .unwrap();

        assert_eq!(update.rejected, vec![secret.clone()]);
        assert!(update.board.cards.is_empty());
        assert_eq!(ops(&state, rid, board.id), 1);
        assert_eq!(sigrefs(&state, rid), before);

        // On its own repository's board it's an ordinary card.
        let own = state
            .create_board(private, "Private".into(), quiet())
            .unwrap();
        let update = state
            .update_board(
                private,
                own.id,
                vec![moved(&secret, "todo", "V")],
                vec![],
                quiet(),
            )
            .unwrap();
        assert!(update.rejected.is_empty());
    }

    #[test]
    fn board_links_follow_keywords_and_full_references() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid) = setup(tmp.path(), Network::Test);
        let repo = state.profile.storage.repository(rid).unwrap();
        let signer = SigningKey::from_seed(Seed::new(SEED));
        let mut issues = state.profile.issues_mut(&repo, &signer).unwrap();
        let issue = *issues
            .create(Title::new("Linked").unwrap(), "", &[], &[], [])
            .unwrap()
            .id();
        let other = *issues
            .create(Title::new("Unlinked").unwrap(), "", &[], &[], [])
            .unwrap()
            .id();
        let (_, head) = repo.head().unwrap();
        let mut patches = state.profile.patches_mut(&repo, &signer).unwrap();
        let patch = *patches
            .create(
                Title::new("Shout").unwrap(),
                format!(
                    "Fixes {rid}/cob/xyz.radicle.issue/{issue} but not {other} or rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5/cob/xyz.radicle.issue/{other}"
                ),
                radicle::cob::patch::MergeTarget::Delegates,
                head,
                head,
                &[],
            )
            .unwrap()
            .id();

        let links = state.board_links(rid).unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].patch, patch);
        assert_eq!(links[0].issues, vec![issue]);
    }

    #[test]
    fn boards_are_read_through_the_cache() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid) = setup(tmp.path(), Network::Test);
        let a = open_issue(&state, rid, "Mine");
        let bobs = open_issue_as(&state, rid, "Bob's", OTHER_SEED);
        let board = state.create_board(rid, "Roadmap".into(), quiet()).unwrap();
        let db = radicle_board::cache_db_path(state.profile.cobs());
        assert!(db.exists());

        let update = state
            .update_board(rid, board.id, vec![moved(&a, "todo", "V")], vec![], quiet())
            .unwrap();
        let listed = state.list_boards(rid).unwrap();
        assert_eq!(listed, vec![update.board.clone()]);

        // A row with the current token is served as is.
        let repo = state.profile.storage.repository(rid).unwrap();
        let tips: Vec<radicle::git::Oid> = repo
            .backend
            .references_glob(&radicle_board::REFS)
            .unwrap()
            .map(|r| r.unwrap().target().unwrap().into())
            .collect();
        let mut tampered = serde_json::to_value(
            radicle_board::Boards::open(&repo, ReadOnly)
                .unwrap()
                .get(&board.id)
                .unwrap(),
        )
        .unwrap();
        tampered["name"] = "Tampered".into();
        radicle_board::cache::Store::open(&db)
            .unwrap()
            .update(
                &rid,
                &board.id,
                &radicle_board::cache::head_token(&tips),
                &serde_json::from_value(tampered).unwrap(),
            )
            .unwrap();
        assert_eq!(state.list_boards(rid).unwrap()[0].name, "Tampered");

        // Bob's move arrives in his namespace, as after a fetch.
        let bob = SigningKey::from_seed(Seed::new(OTHER_SEED));
        let mut boards = radicle_board::Boards::open(&repo, WriteAs::new(&bob)).unwrap();
        let action = boards.move_action(bobs.clone().into(), "todo".into(), "W".into(), None);
        boards
            .update(&state.profile.storage, &board.id, vec![action])
            .unwrap();

        let listed = state.list_boards(rid).unwrap();
        assert_eq!(listed[0].name, "Roadmap");
        assert_eq!(listed[0].cards.len(), 2);
        assert_eq!(listed[0].cards[1].card, bobs);
        let renamed = state
            .rename_board(rid, board.id, "Plan".into(), quiet())
            .unwrap();
        assert_eq!(state.list_boards(rid).unwrap(), vec![renamed]);
    }
}
