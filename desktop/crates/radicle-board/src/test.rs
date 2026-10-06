use radicle::cob::cache::NoCache;
use radicle::cob::issue::Issues;
use radicle::cob::store::access::{ReadOnly, WriteAs};
use radicle::cob::{ObjectId, Title};
use radicle::crypto::{Signer as _, SigningKey};
use radicle::identity::Did;
use radicle::storage::ReadRepository;
use radicle::test;

use crate::{Boards, Card, position};

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

fn first() -> String {
    position::between(None, None).unwrap()
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
    let board = boards
        .move_card(&id, card.clone(), "todo".into(), first(), None)
        .unwrap();
    assert_eq!(board.placement(&card).unwrap().column, "todo");

    let board = boards.remove_card(&id, card.clone()).unwrap();
    assert!(board.placement(&card).is_none());

    let read = Boards::open(&*repo, ReadOnly).unwrap();
    assert_eq!(read.list().unwrap().len(), 1);
}

#[test]
fn moves_to_unknown_columns_are_ignored() {
    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let issue = open_issue(&repo, &alice.signer, "Issue");
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();
    let card = issue_card(&*repo, issue);

    let board = boards
        .move_card(&id, card.clone(), "nowhere".into(), first(), None)
        .unwrap();
    assert!(board.placement(&card).is_none());
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
    let board = boards
        .move_card(&id, card.clone(), "todo".into(), first(), None)
        .unwrap();
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
    let board = boards
        .move_card(&id, card.clone(), "in-progress".into(), first(), None)
        .unwrap();
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
    let board = boards
        .move_card(&id, card.clone(), "todo".into(), first(), None)
        .unwrap();
    assert!(board.placement(&card).is_none());
    let board = boards
        .move_card(
            &id,
            card.clone(),
            "todo".into(),
            first(),
            Some(other_assignment),
        )
        .unwrap();
    assert!(board.placement(&card).is_none());

    let board = boards
        .move_card(&id, card.clone(), "todo".into(), first(), Some(assignment))
        .unwrap();
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
    let board = boards
        .move_card(&id, card.clone(), "todo".into(), first(), Some(comment))
        .unwrap();
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
    boards
        .move_card(&id, a.clone(), "todo".into(), p1, None)
        .unwrap();
    boards
        .move_card(&id, b.clone(), "todo".into(), p2, None)
        .unwrap();
    boards
        .move_card(&id, c.clone(), "backlog".into(), p0, None)
        .unwrap();

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
    let board = boards
        .move_card(&id, card.clone(), "todo".into(), first(), Some(*issue))
        .unwrap();
    assert_eq!(board.placement(&card).unwrap().column, "todo");
}
