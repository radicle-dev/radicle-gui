use radicle::cob::cache::NoCache;
use radicle::cob::issue::Issues;
use radicle::cob::patch::{MergeTarget, Patches};
use radicle::cob::store::access::{ReadOnly, WriteAs};
use radicle::cob::{Contents, ObjectId, Title, Update};
use radicle::crypto::{Signer as _, SigningKey};
use radicle::git::{Oid, raw};
use radicle::identity::{Did, RepoId, Visibility};
use radicle::storage::{ReadRepository, ReadStorage};
use radicle::test;

use crate::{Action, Board, BoardId, Boards, Card, Column, position};

fn issue_card(repo: &impl ReadRepository, oid: ObjectId) -> Card {
    Card {
        rid: repo.id(),
        type_name: radicle::cob::issue::TYPENAME.clone(),
        oid,
    }
}

#[allow(clippy::let_and_return)]
fn open_issue(
    repo: &radicle::storage::git::Repository,
    signer: &SigningKey,
    title: &str,
) -> ObjectId {
    let mut issues = Issues::open(repo, WriteAs::new(signer)).unwrap();
    let mut cache = NoCache;
    let issue = issues
        .create(Title::new(title).unwrap(), "", &[], &[], [], &mut cache)
        .unwrap();
    let id = *issue.id();
    id
}

fn patch_card(repo: &impl ReadRepository, oid: ObjectId) -> Card {
    Card {
        rid: repo.id(),
        type_name: radicle::cob::patch::TYPENAME.clone(),
        oid,
    }
}

fn open_patch(repo: &test::setup::NodeRepo, signer: &SigningKey, title: &str) -> ObjectId {
    let branch = repo.checkout().branch_with([("README", b"hello")]);
    let mut patches = Patches::open(&**repo, WriteAs::new(signer)).unwrap();
    let mut cache = NoCache;
    let patch = patches
        .create(
            Title::new(title).unwrap(),
            "",
            MergeTarget::Delegates,
            branch.base,
            branch.oid,
            &[],
            &mut cache,
        )
        .unwrap();
    *patch.id()
}

/// Another repository in `node`'s storage.
fn other_repo(node: &test::setup::Node, name: &str, visibility: Visibility) -> RepoId {
    let (working, _) = test::fixtures::repository(node.root.join(name));
    let (rid, _, _) = radicle::rad::init(
        &working,
        name.try_into().unwrap(),
        "",
        "master".try_into().unwrap(),
        visibility,
        &node.signer,
        &node.storage,
    )
    .unwrap();
    rid
}

fn first() -> String {
    position::between(None, None).unwrap()
}

type WritableBoards<'a> = Boards<'a, radicle::storage::git::Repository, WriteAs<'a, SigningKey>>;

fn move_card(
    storage: &impl ReadStorage,
    boards: &mut WritableBoards,
    id: &BoardId,
    card: Card,
    column: &str,
    position: String,
    proof: Option<Oid>,
) -> Board {
    let action = boards.move_action(card, column.into(), position, proof);
    boards.update(storage, id, vec![action]).unwrap()
}

/// A copy of the operation `op` whose signature is the one from `signed_by`,
/// made over that other operation's contents, so it doesn't verify for this
/// one. The key named in it is the one that signed `signed_by`.
fn forge(repo: &raw::Repository, op: Oid, signed_by: Oid) -> Oid {
    let genuine = repo.find_commit(op.into()).unwrap();
    let other = repo.find_commit(signed_by.into()).unwrap();
    let signature = other.header_field_bytes("gpgsig").unwrap();
    let parents: Vec<_> = genuine.parents().collect();
    let parents: Vec<_> = parents.iter().collect();
    let buffer = repo
        .commit_create_buffer(
            &genuine.author(),
            &genuine.committer(),
            genuine.message().unwrap(),
            &genuine.tree().unwrap(),
            &parents,
        )
        .unwrap();
    repo.commit_signed(
        buffer.as_str().unwrap(),
        signature.as_str().unwrap(),
        Some("gpgsig"),
    )
    .unwrap()
    .into()
}

#[test]
fn delegate_moves_cards() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, board) = boards.create("Roadmap").unwrap();
    assert_eq!(board.name(), "Roadmap");
    assert!(board.cards().is_empty());

    let card = issue_card(&*repo, issue);
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");

    let board = boards
        .update(
            &alice.storage,
            &id,
            vec![Action::Remove { card: card.clone() }],
        )
        .unwrap();
    assert!(board.placement(&card).is_none());

    let read = Boards::open(&*repo, ReadOnly).unwrap();
    assert_eq!(read.list().unwrap().len(), 1);
}

#[test]
fn moves_count_whatever_the_columns() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    let card = issue_card(&*repo, issue);
    let review = Column::new("review", "Review", None);

    // Into a column that a concurrent change hasn't added here yet.
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "review",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "review");
    let mut columns = crate::default_columns();
    columns.push(review);
    let board = boards.set_columns(&id, columns).unwrap();
    assert_eq!(board.placement(&card).unwrap().column, "review");

    // And the column being removed afterwards keeps the move.
    let board = boards.set_columns(&id, crate::default_columns()).unwrap();
    assert_eq!(board.placement(&card).unwrap().column, "review");

    let long = "i".repeat(crate::MAX_COLUMN_ID_LEN + 1);
    for column in ["", long.as_str()] {
        let board = move_card(
            &alice.storage,
            &mut boards,
            &id,
            card.clone(),
            column,
            first(),
            None,
        );
        assert_eq!(board.placement(&card).unwrap().column, "review");
    }
}

#[test]
fn assignees_move_into_unknown_columns_as_open_ones() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let carol = SigningKey::mock(2);
    let issue = open_issue(&repo, &carol, "Carol's issue");
    let assignment = Issues::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .get_mut(&issue, &mut NoCache)
        .unwrap()
        .assign([Did::from(*bob.public_key())])
        .unwrap();
    let mut delegate = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = delegate.create("Roadmap").unwrap();
    let card = issue_card(&*repo, issue);

    let mut assignee = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let board = move_card(
        &alice.storage,
        &mut assignee,
        &id,
        card.clone(),
        "qa",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "qa");

    // Once "qa" closes issues, only the author can move the card out of it.
    let mut columns = crate::default_columns();
    columns.push(Column::new("qa", "QA", Some(crate::Closes::Solved)));
    delegate.set_columns(&id, columns).unwrap();
    let board = move_card(
        &alice.storage,
        &mut assignee,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "qa");

    let mut author = Boards::open(&*repo, WriteAs::new(&carol)).unwrap();
    let board = move_card(
        &alice.storage,
        &mut author,
        &id,
        card.clone(),
        "todo",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");
}

#[test]
fn only_delegates_create_boards() {
    let test::setup::NodeWithRepo { node: _alice, repo } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();

    assert!(boards.create("Bob's board").is_err());
}

#[test]
fn others_cannot_move_cards() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();

    let bob = SigningKey::mock(1);
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let card = issue_card(&*repo, issue);
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        None,
    );
    assert!(board.placement(&card).is_none());

    let board = boards
        .set_columns(&id, vec![crate::Column::new("mine", "Mine", None)])
        .unwrap();
    assert_eq!(board.columns(), crate::default_columns().as_slice());
}

#[test]
fn authors_move_their_own_cards() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();

    let bob = SigningKey::mock(1);
    let issue = open_issue(&repo, &bob, "Bob's issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let card = issue_card(&*repo, issue);
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "in-progress",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "in-progress");
}

#[test]
fn assignees_move_cards_with_proof() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let other = open_issue(&repo, &alice.signer, "Another issue");

    let mut issues = Issues::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let assignment = issues
        .get_mut(&issue, &mut NoCache)
        .unwrap()
        .assign([Did::from(*bob.public_key())])
        .unwrap();
    let other_assignment = issues
        .get_mut(&other, &mut NoCache)
        .unwrap()
        .assign([Did::from(*bob.public_key())])
        .unwrap();

    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let card = issue_card(&*repo, issue);

    // Without proof, or with an assignment to a different issue, the move is
    // ignored.
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        None,
    );
    assert!(board.placement(&card).is_none());
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(other_assignment),
    );
    assert!(board.placement(&card).is_none());

    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");
}

#[test]
fn proofs_that_do_not_travel_with_the_move_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let assignment = Issues::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .get_mut(&issue, &mut NoCache)
        .unwrap()
        .assign([Did::from(*bob.public_key())])
        .unwrap();
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();
    let card = issue_card(&*repo, issue);

    // Written by a client that names the proof but only links the card.
    let action = Action::Move {
        card: card.clone(),
        column: "todo".into(),
        position: first(),
        proof: Some(assignment),
        local: true,
    };
    radicle::cob::update::<Board, _>(
        &*repo,
        &bob,
        Some(repo.identity_head().unwrap()),
        vec![*issue],
        bob.public_key(),
        Update {
            changes: Contents::new(serde_json::to_vec(&action).unwrap()),
            object_id: id,
            type_name: crate::TYPENAME.clone(),
            message: "Move".into(),
            embeds: vec![],
        },
    )
    .unwrap();

    let read = Boards::open(&*repo, ReadOnly).unwrap();
    assert!(read.get(&id).unwrap().unwrap().placement(&card).is_none());

    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");
}

#[test]
fn self_assignment_is_not_proof() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();

    // Bob's own assignment is rejected by the issue, so he has no operation to
    // offer as proof; a comment of his on the issue isn't one either.
    let mut issues = Issues::open(&*repo, WriteAs::new(&bob)).unwrap();
    let mut cache = NoCache;
    let mut handle = issues.get_mut(&issue, &mut cache).unwrap();
    assert!(handle.assign([Did::from(*bob.public_key())]).is_err());
    let comment = handle.comment("On it", *issue, []).unwrap();

    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let card = issue_card(&*repo, issue);
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(comment),
    );
    assert!(board.placement(&card).is_none());
}

#[test]
fn cards_sort_by_column_then_position() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let a = issue_card(&*repo, open_issue(&repo, &alice.signer, "A"));
    let b = issue_card(&*repo, open_issue(&repo, &alice.signer, "B"));
    let c = issue_card(&*repo, open_issue(&repo, &alice.signer, "C"));
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();

    let p1 = first();
    let p2 = position::between(Some(&p1), None).unwrap();
    let p0 = position::between(None, Some(&p1)).unwrap();
    move_card(
        &alice.storage,
        &mut boards,
        &id,
        a.clone(),
        "todo",
        p1,
        None,
    );
    move_card(
        &alice.storage,
        &mut boards,
        &id,
        b.clone(),
        "todo",
        p2,
        None,
    );
    move_card(
        &alice.storage,
        &mut boards,
        &id,
        c.clone(),
        "backlog",
        p0,
        None,
    );

    let board = boards.get(&id).unwrap().unwrap();
    let order: Vec<_> = board
        .cards()
        .into_iter()
        .map(|(card, _)| card.clone())
        .collect();
    assert_eq!(order, vec![c, a, b]);
}

#[test]
fn assignment_at_creation_is_proof() {
    let test::setup::NodeWithRepo { node: alice, repo } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let mut issues = Issues::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let mut cache = NoCache;
    let issue = *issues
        .create(
            Title::new("Assigned from the start").unwrap(),
            "",
            &[],
            &[Did::from(*bob.public_key())],
            [],
            &mut cache,
        )
        .unwrap()
        .id();

    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let card = issue_card(&*repo, issue);
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(*issue),
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");
}

#[test]
fn a_batch_is_one_operation() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let first_issue = open_issue(&repo, &alice.signer, "First");
    let second_issue = open_issue(&repo, &alice.signer, "Second");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    let a = issue_card(&*repo, first_issue);
    let b = issue_card(&*repo, second_issue);

    let actions = vec![
        boards.move_action(a.clone(), "todo".into(), first(), None),
        boards.move_action(b.clone(), "done".into(), first(), None),
    ];
    let board = boards.update(&alice.storage, &id, actions).unwrap();
    assert_eq!(board.placement(&a).unwrap().column, "todo");
    assert_eq!(board.placement(&b).unwrap().column, "done");

    let ops = radicle::cob::store::ops(&id, &crate::TYPENAME, &*repo).unwrap();
    assert_eq!(ops.len(), 2);
    let update = ops.last();
    assert_eq!(update.actions.len(), 2);
    assert!(update.related.contains(&*first_issue));
    assert!(update.related.contains(&*second_issue));
}

#[test]
fn unauthorized_actions_in_a_batch_are_skipped() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let alices = open_issue(&repo, &alice.signer, "Alice's issue");
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();

    let bob = SigningKey::mock(1);
    let bobs = open_issue(&repo, &bob, "Bob's issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let own = issue_card(&*repo, bobs);
    let other = issue_card(&*repo, alices);
    let actions = vec![
        boards.move_action(own.clone(), "todo".into(), first(), None),
        boards.move_action(other.clone(), "todo".into(), first(), None),
        crate::Action::Columns {
            columns: vec![crate::Column::new("mine", "Mine", None)],
        },
    ];
    let board = boards.update(&alice.storage, &id, actions).unwrap();

    assert_eq!(board.placement(&own).unwrap().column, "todo");
    assert!(board.placement(&other).is_none());
    assert_eq!(board.columns(), crate::default_columns().as_slice());
}

#[test]
fn authorization_can_be_checked_before_writing() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let alices = open_issue(&repo, &alice.signer, "Alice's issue");
    let bob = SigningKey::mock(1);
    let bobs = open_issue(&repo, &bob, "Bob's issue");

    let (id, board) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();
    let boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let own = boards.move_action(issue_card(&*repo, bobs), "todo".into(), first(), None);
    let other = boards.move_action(issue_card(&*repo, alices), "todo".into(), first(), None);
    let rename = crate::Action::Edit {
        name: "Mine".into(),
    };
    let bob_key = *bob.public_key();
    let alice_key = *alice.signer.public_key();

    assert!(boards.authorized(&board, &own, &bob_key).unwrap());
    assert!(!boards.authorized(&board, &other, &bob_key).unwrap());
    assert!(!boards.authorized(&board, &rename, &bob_key).unwrap());
    assert!(boards.authorized(&board, &other, &alice_key).unwrap());
    assert!(boards.authorized(&board, &rename, &alice_key).unwrap());
    assert_eq!(boards.get(&id).unwrap().unwrap(), board);
}

#[test]
fn operations_are_written_in_the_current_version() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    boards.rename(&id, "Plans").unwrap();

    let ops = radicle::cob::store::ops(&id, &crate::TYPENAME, &*repo).unwrap();
    assert!(
        ops.iter()
            .all(|op| usize::from(op.manifest.version) == crate::VERSION)
    );
}

#[test]
fn newer_formats_are_unsupported() {
    let current = radicle::cob::Version::new(crate::VERSION).unwrap();
    let newer = radicle::cob::Version::new(crate::VERSION + 1).unwrap();
    assert!(crate::supported(current));
    assert!(!crate::supported(newer));
}

#[test]
fn forged_proofs_are_rejected() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let mut issues = Issues::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let assignment = issues
        .get_mut(&issue, &mut NoCache)
        .unwrap()
        .assign([Did::from(*bob.public_key())])
        .unwrap();
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();

    // The forged proof has the assignment's contents under a signature that
    // doesn't verify for them.
    let forged = forge(&repo.backend, assignment, *issue);
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let card = issue_card(&*repo, issue);
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(forged),
    );
    assert!(board.placement(&card).is_none());

    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");
}

#[test]
fn forged_card_roots_are_rejected() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let alices = open_issue(&repo, &alice.signer, "Alice's issue");
    let bobs = open_issue(&repo, &bob, "Bob's issue");
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();

    // A copy of Alice's issue root that names Bob as its author, under a
    // signature that doesn't verify for it.
    let forged = forge(&repo.backend, *alices, *bobs);
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let card = issue_card(&*repo, forged.into());
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        None,
    );
    assert!(board.placement(&card).is_none());
}

#[test]
fn operations_that_do_not_decode_are_skipped() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();

    let identity = repo.identity_head().unwrap();
    radicle::cob::update::<Board, _>(
        &*repo,
        &alice.signer,
        Some(identity),
        vec![],
        alice.signer.public_key(),
        Update {
            changes: Contents::new(b"not an action".to_vec()),
            object_id: id,
            type_name: crate::TYPENAME.clone(),
            message: "Garbage".into(),
            embeds: vec![],
        },
    )
    .unwrap();

    let card = issue_card(&*repo, issue);
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");
    assert_eq!(boards.get(&id).unwrap().unwrap(), board);
    assert_eq!(
        radicle::cob::store::ops(&id, &crate::TYPENAME, &*repo)
            .unwrap()
            .len(),
        3
    );
}

#[test]
fn closing_columns_follow_the_issue_rules() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let carol = SigningKey::mock(2);
    let bobs = open_issue(&repo, &bob, "Bob's issue");
    let mut issues = Issues::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let assignment = issues
        .get_mut(&bobs, &mut NoCache)
        .unwrap()
        .assign([Did::from(*carol.public_key())])
        .unwrap();
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();
    let card = issue_card(&*repo, bobs);

    // Carol is assigned, so she moves between open columns only.
    let mut carols = Boards::open(&*repo, WriteAs::new(&carol)).unwrap();
    let board = move_card(
        &alice.storage,
        &mut carols,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");
    let board = move_card(
        &alice.storage,
        &mut carols,
        &id,
        card.clone(),
        "done",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");

    // Bob wrote the issue, so he may close and reopen it.
    let mut bobs_board = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let board = move_card(
        &alice.storage,
        &mut bobs_board,
        &id,
        card.clone(),
        "done",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "done");

    // Within a closing column the issue's state doesn't change, so Carol may
    // reorder it there, but not move it out or to a column with another
    // reason.
    let below = position::between(Some(&first()), None).unwrap();
    let board = move_card(
        &alice.storage,
        &mut carols,
        &id,
        card.clone(),
        "done",
        below.clone(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().position, below);
    let board = move_card(
        &alice.storage,
        &mut carols,
        &id,
        card.clone(),
        "canceled",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "done");
    let board = move_card(
        &alice.storage,
        &mut carols,
        &id,
        card.clone(),
        "in-progress",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "done");
    let board = move_card(
        &alice.storage,
        &mut bobs_board,
        &id,
        card.clone(),
        "in-progress",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "in-progress");
}

#[test]
fn patches_never_land_in_closing_columns() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let patch = open_patch(&repo, &alice.signer, "Alice's patch");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    let card = patch_card(&*repo, patch);

    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "done",
        first(),
        None,
    );
    assert!(board.placement(&card).is_none());
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "in-review",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "in-review");
}

#[test]
fn card_roots_of_the_wrong_type_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();
    let bob = SigningKey::mock(1);
    let issue = open_issue(&repo, &bob, "Bob's issue");
    let mut issues = Issues::open(&*repo, WriteAs::new(&bob)).unwrap();
    let comment = issues
        .get_mut(&issue, &mut NoCache)
        .unwrap()
        .comment("Not a root", *issue, [])
        .unwrap();
    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();

    let wrong_type = Card {
        type_name: radicle::cob::patch::TYPENAME.clone(),
        ..issue_card(&*repo, issue)
    };
    let unknown_type = Card {
        type_name: "xyz.radicle.other".parse().unwrap(),
        ..issue_card(&*repo, issue)
    };
    let not_a_root = issue_card(&*repo, comment.into());
    for card in [wrong_type, unknown_type, not_a_root] {
        let board = move_card(
            &alice.storage,
            &mut boards,
            &id,
            card.clone(),
            "todo",
            first(),
            None,
        );
        assert!(board.placement(&card).is_none(), "{card:?}");
    }
}

#[test]
fn delegates_cards_are_checked_too() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let alices = open_issue(&repo, &alice.signer, "Alice's issue");
    let bobs = open_issue(&repo, &bob, "Bob's issue");
    let mut issues = Issues::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let comment = issues
        .get_mut(&alices, &mut NoCache)
        .unwrap()
        .comment("Not a root", *alices, [])
        .unwrap();
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();

    let wrong_type = Card {
        type_name: radicle::cob::patch::TYPENAME.clone(),
        ..issue_card(&*repo, alices)
    };
    let unknown_type = Card {
        type_name: "xyz.radicle.other".parse().unwrap(),
        ..issue_card(&*repo, alices)
    };
    let not_a_root = issue_card(&*repo, comment.into());
    let forged = issue_card(&*repo, forge(&repo.backend, *alices, *bobs).into());
    for card in [wrong_type, unknown_type, not_a_root, forged] {
        let board = move_card(
            &alice.storage,
            &mut boards,
            &id,
            card.clone(),
            "todo",
            first(),
            None,
        );
        assert!(board.placement(&card).is_none(), "{card:?}");
    }

    // A card from another repository can only have its type name checked.
    let elsewhere = Card {
        rid: other_repo(&alice, "elsewhere", Visibility::default()),
        ..issue_card(&*repo, alices)
    };
    let elsewhere_unknown = Card {
        type_name: "xyz.radicle.other".parse().unwrap(),
        ..elsewhere.clone()
    };
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        elsewhere_unknown.clone(),
        "todo",
        first(),
        None,
    );
    assert!(board.placement(&elsewhere_unknown).is_none());
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        elsewhere.clone(),
        "todo",
        first(),
        None,
    );
    assert_eq!(board.placement(&elsewhere).unwrap().column, "todo");
}

#[test]
fn private_repositories_cards_stay_off_other_boards() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    let from = |rid| Card {
        rid,
        ..issue_card(&*repo, issue)
    };
    let private = from(other_repo(&alice, "private", Visibility::private([])));
    let missing = from("rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5".parse().unwrap());
    let public = from(other_repo(&alice, "public", Visibility::default()));

    for (card, refused) in [
        (private.clone(), crate::ShareError::Private(private.rid)),
        (missing.clone(), crate::ShareError::Unavailable(missing.rid)),
    ] {
        let action = boards.move_action(card, "todo".into(), first(), None);
        let err = boards
            .update(&alice.storage, &id, vec![action])
            .unwrap_err();
        assert!(
            matches!(err, crate::UpdateError::Share(ref e) if e.to_string() == refused.to_string()),
            "{err}"
        );
    }
    assert!(boards.get(&id).unwrap().unwrap().cards().is_empty());

    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        public.clone(),
        "todo",
        first(),
        None,
    );
    assert_eq!(board.placement(&public).unwrap().column, "todo");
}

#[test]
fn oversized_names_columns_and_positions_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    let card = issue_card(&*repo, issue);

    let board = boards
        .rename(&id, &"n".repeat(crate::MAX_NAME_LEN + 1))
        .unwrap();
    assert_eq!(board.name(), "Roadmap");
    let board = boards
        .rename(&id, &"n".repeat(crate::MAX_NAME_LEN))
        .unwrap();
    assert_eq!(board.name().len(), crate::MAX_NAME_LEN);

    let too_many: Vec<_> = (0..=crate::MAX_COLUMNS)
        .map(|i| Column::new(&format!("c{i}"), "Column", None))
        .collect();
    let long_id = vec![Column::new(
        &"i".repeat(crate::MAX_COLUMN_ID_LEN + 1),
        "Column",
        None,
    )];
    let long_name = vec![Column::new("c", &"n".repeat(crate::MAX_NAME_LEN + 1), None)];
    for columns in [too_many, long_id, long_name] {
        let board = boards.set_columns(&id, columns).unwrap();
        assert_eq!(board.columns(), crate::default_columns().as_slice());
    }

    let long = format!("{}1", "V".repeat(crate::MAX_POSITION_LEN));
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        long,
        None,
    );
    assert!(board.placement(&card).is_none());
}

#[test]
fn moves_that_do_not_link_their_local_card_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    let card = issue_card(&*repo, issue);

    let unlinked = Action::Move {
        card: card.clone(),
        column: "todo".into(),
        position: first(),
        proof: None,
        local: false,
    };
    let board = boards.update(&alice.storage, &id, vec![unlinked]).unwrap();
    assert!(board.placement(&card).is_none());

    let linked = boards.move_action(card.clone(), "todo".into(), first(), None);
    let board = boards.update(&alice.storage, &id, vec![linked]).unwrap();
    assert_eq!(board.placement(&card).unwrap().column, "todo");
}

/// A copy of the operation `op` without `parent` among its git parents, and
/// with the same message, so the same trailers.
fn without_parent(repo: &raw::Repository, op: Oid, parent: Oid) -> Oid {
    let genuine = repo.find_commit(op.into()).unwrap();
    let signature = genuine.header_field_bytes("gpgsig").unwrap();
    let parents: Vec<_> = genuine
        .parents()
        .filter(|p| Oid::from(p.id()) != parent)
        .collect();
    let parents: Vec<_> = parents.iter().collect();
    let buffer = repo
        .commit_create_buffer(
            &genuine.author(),
            &genuine.committer(),
            genuine.message().unwrap(),
            &genuine.tree().unwrap(),
            &parents,
        )
        .unwrap();
    repo.commit_signed(
        buffer.as_str().unwrap(),
        signature.as_str().unwrap(),
        Some("gpgsig"),
    )
    .unwrap()
    .into()
}

/// Replaces the tip of `alice`'s reference to board `id` with a copy of it
/// that lacks `parent`, and returns the copy's entry.
fn drop_parent(
    alice: &test::setup::Node,
    repo: &test::setup::NodeRepo,
    id: &BoardId,
    parent: Oid,
) -> radicle::cob::Entry {
    let name = radicle::git::refs::storage::cob(alice.signer.public_key(), &crate::TYPENAME, id)
        .to_string();
    let tip = repo.backend.refname_to_id(&name).unwrap();
    let copy = without_parent(&repo.backend, tip.into(), parent);
    repo.backend
        .reference(&name, copy.into(), true, "")
        .unwrap();
    radicle::cob::change::Storage::load(&**repo, copy).unwrap()
}

// The commits an op relies on must be its git parents, not just named in
// trailers, so every peer evaluates it the same way.
#[test]
fn moves_whose_card_is_not_a_parent_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    let card = issue_card(&*repo, issue);
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        None,
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");

    // The same move, with the card's root in a trailer but not a parent.
    let entry = drop_parent(&alice, &repo, &id, *issue);
    assert!(entry.related.contains(&*issue));
    let board = boards.get(&id).unwrap().unwrap();
    assert!(board.placement(&card).is_none());
}

#[test]
fn operations_whose_identity_is_not_a_parent_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    assert_eq!(boards.rename(&id, "Plan").unwrap().name(), "Plan");

    // The same rename, with the identity in a trailer but not a parent.
    let identity = repo.identity_head().unwrap();
    let entry = drop_parent(&alice, &repo, &id, identity);
    assert_eq!(entry.resource, Some(identity));
    assert_eq!(boards.get(&id).unwrap().unwrap().name(), "Roadmap");
}

#[test]
fn boards_whose_first_identity_is_not_a_parent_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();

    // The same first op, with the identity in a trailer but not a parent.
    let identity = repo.identity_head().unwrap();
    let copy = without_parent(&repo.backend, *id, identity);
    let entry = radicle::cob::change::Storage::load(&*repo, copy).unwrap();
    assert_eq!(entry.resource, Some(identity));
    let copy = BoardId::from(copy);
    let name = radicle::git::refs::storage::cob(alice.signer.public_key(), &crate::TYPENAME, &copy)
        .to_string();
    repo.backend
        .reference(&name, (*copy).into(), true, "")
        .unwrap();

    let read = Boards::open(&*repo, ReadOnly).unwrap();
    assert!(read.get(&id).unwrap().is_some());
    assert!(!matches!(read.get(&copy), Ok(Some(_))));
    assert!(
        read.list()
            .unwrap()
            .iter()
            .all(|(listed, _)| *listed != copy)
    );
}

#[test]
fn proofs_whose_identity_is_not_a_parent_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let issue = open_issue(&repo, &alice.signer, "Alice's issue");
    let assignment = Issues::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .get_mut(&issue, &mut NoCache)
        .unwrap()
        .assign([Did::from(*bob.public_key())])
        .unwrap();
    let (id, _) = Boards::open(&*repo, WriteAs::new(&alice.signer))
        .unwrap()
        .create("Roadmap")
        .unwrap();
    let card = issue_card(&*repo, issue);

    // The same assignment, with the identity in a trailer but not a parent.
    let identity = radicle::cob::change::Storage::load(&*repo, assignment)
        .unwrap()
        .resource
        .unwrap();
    let copy = without_parent(&repo.backend, assignment, identity);

    let mut boards = Boards::open(&*repo, WriteAs::new(&bob)).unwrap();
    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(copy),
    );
    assert!(board.placement(&card).is_none());

    let board = move_card(
        &alice.storage,
        &mut boards,
        &id,
        card.clone(),
        "todo",
        first(),
        Some(assignment),
    );
    assert_eq!(board.placement(&card).unwrap().column, "todo");
}
