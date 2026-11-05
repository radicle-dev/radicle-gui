//! Times reading a board with thousands of operations: plain evaluation,
//! memoised evaluation, and reads through the cache.
//!
//! ```sh
//! cargo run --release --example bench_cache -p radicle-board --features sqlite
//! BENCH_OPS=5000 BENCH_ISSUES=300 cargo run --release --example bench_cache \
//!     -p radicle-board --features sqlite
//! ```
//!
//! Operations are written directly to git, as heartwood's write path would
//! evaluate the whole board twice per operation.

#![allow(clippy::unwrap_used)]
#![cfg_attr(not(feature = "sqlite"), allow(dead_code, unused_imports))]

use std::hint::black_box;
use std::time::{Duration, Instant};

use radicle::cob::cache::NoCache;
use radicle::cob::issue::Issues;
use radicle::cob::store::access::{ReadOnly, WriteAs};
use radicle::cob::store::{CobAction, encoding};
use radicle::cob::{self, Contents, ObjectId, Title};
use radicle::crypto::{Signer as _, SigningKey};
use radicle::git::Oid;
use radicle::identity::Did;
use radicle::storage::ReadRepository;
use radicle::storage::git::Repository;
use radicle::test;
use radicle_board::{Action, Board, BoardId, Boards, Card, TYPENAME, position};

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// A small deterministic generator, so runs are comparable.
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

/// Writes `actions` as one operation by `signer` on top of `tips`, without
/// evaluating the board, and returns the operation's id.
fn write_op(
    repo: &Repository,
    signer: &SigningKey,
    id: &BoardId,
    tips: Vec<Oid>,
    actions: Vec<Action>,
) -> Oid {
    let related = actions.iter().flat_map(CobAction::parents).collect();
    let contents = Contents::from_vec(
        actions
            .into_iter()
            .map(|a| encoding::encode(a).unwrap())
            .collect(),
    )
    .unwrap();
    let entry = cob::change::Storage::store(
        repo,
        Some(repo.identity_head().unwrap()),
        related,
        signer,
        cob::change::Template {
            type_name: TYPENAME.clone(),
            tips,
            message: "Update board".into(),
            embeds: vec![],
            contents,
        },
    )
    .unwrap();
    cob::object::Storage::update(repo, signer.public_key(), &TYPENAME, id, &entry.id).unwrap();
    entry.id
}

fn time(label: &str, iters: u32, mut f: impl FnMut()) -> Duration {
    let start = Instant::now();
    for _ in 0..iters {
        f();
    }
    let mean = start.elapsed() / iters;
    println!("  {label:<44} {mean:>10.2?}");
    mean
}

#[cfg(not(feature = "sqlite"))]
fn main() {}

#[cfg(feature = "sqlite")]
fn main() {
    let n_ops = env_usize("BENCH_OPS", 3000);
    let n_issues = env_usize("BENCH_ISSUES", 200);
    let mut random = Random(0x9e37_79b9_7f4a_7c15);

    let test::setup::NodeWithRepo {
        node: alice, repo, ..
    } = test::setup::NodeWithRepo::default();
    let bob = SigningKey::mock(1);
    let carol = SigningKey::mock(2);
    let columns = ["backlog", "todo", "in-progress", "in-review"];

    println!("building fixture: {n_issues} issues, {n_ops} operations by three authors ...");
    let build = Instant::now();
    let mut cache = NoCache;
    let mut issues = Issues::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let mut alices = Vec::new();
    let mut assigned = Vec::new();
    for i in 0..n_issues {
        let issue = issues
            .create(
                Title::new(&format!("Issue {i}")).unwrap(),
                "",
                &[],
                &[],
                [],
                &mut cache,
            )
            .unwrap();
        let id = *issue.id();
        if i % 3 == 0 {
            let proof = issues
                .get_mut(&id, &mut NoCache)
                .unwrap()
                .assign([Did::from(*bob.public_key())])
                .unwrap();
            assigned.push((id, proof));
        } else {
            alices.push(id);
        }
    }
    let mut carols = Vec::new();
    let mut carol_issues = Issues::open(&*repo, WriteAs::new(&carol)).unwrap();
    for i in 0..n_issues / 4 {
        let issue = carol_issues
            .create(
                Title::new(&format!("Carol's issue {i}")).unwrap(),
                "",
                &[],
                &[],
                [],
                &mut cache,
            )
            .unwrap();
        carols.push(*issue.id());
    }
    let card = |oid: ObjectId| Card {
        rid: repo.id(),
        type_name: cob::issue::TYPENAME.clone(),
        oid,
    };
    let mut boards = Boards::open(&*repo, WriteAs::new(&alice.signer)).unwrap();
    let (id, _) = boards.create("Roadmap").unwrap();

    let mut tips = vec![*id];
    let mut previous = tips.clone();
    for i in 0..n_ops {
        let column = columns[random.below(columns.len())].to_string();
        let pos = position::between(None, None).unwrap();
        let (signer, actions) = match random.below(10) {
            0..=5 => {
                let n = 1 + random.below(3);
                let actions = (0..n)
                    .map(|_| {
                        let oid = match random.below(4) {
                            0 => assigned[random.below(assigned.len())].0,
                            1 => carols[random.below(carols.len())],
                            _ => alices[random.below(alices.len())],
                        };
                        boards.move_action(card(oid), column.clone(), pos.clone(), None)
                    })
                    .collect();
                (&alice.signer, actions)
            }
            6..=7 => {
                let (oid, proof) = assigned[random.below(assigned.len())];
                let action = boards.move_action(card(oid), column.clone(), pos, Some(proof));
                (&bob, vec![action])
            }
            8 => {
                let oid = alices[random.below(alices.len())];
                let action = boards.move_action(card(oid), column.clone(), pos, None);
                (&bob, vec![action])
            }
            _ => {
                let oid = carols[random.below(carols.len())];
                let action = boards.move_action(card(oid), column.clone(), pos, None);
                (&carol, vec![action])
            }
        };
        // Every tenth operation is concurrent with the one before it.
        let parents = if i % 10 == 9 {
            previous.clone()
        } else {
            tips.clone()
        };
        let head = write_op(&repo, signer, &id, parents.clone(), actions);
        previous = tips.clone();
        tips.retain(|tip| !parents.contains(tip));
        tips.push(head);
    }
    println!(
        "fixture built in {:.2?}: {} tips across {} namespaces\n",
        build.elapsed(),
        tips.len(),
        repo.backend
            .references_glob(&radicle_board::REFS)
            .unwrap()
            .count()
    );

    let plain = Boards::open(&*repo, ReadOnly).unwrap();
    let placed = plain.get(&id).unwrap().unwrap().cards().len();
    println!("the board places {placed} cards\n");

    let unmemoised = time("evaluation without memoisation", 3, || {
        let board = cob::get::<Board, _>(&*repo, &TYPENAME, &id).unwrap();
        black_box(board);
    });
    let memoised = time("evaluation with memoisation", 3, || {
        black_box(plain.get(&id).unwrap());
    });

    let path = radicle_board::cache_db_path(&alice.root);
    let cached = Boards::open_cached(&*repo, ReadOnly, &path).unwrap();
    let cold = time("cached get, cold (evaluate and store)", 1, || {
        black_box(cached.get(&id).unwrap());
    });
    let warm = time("cached get, warm", 20, || {
        black_box(cached.get(&id).unwrap());
    });
    let list = time("cached list, warm", 20, || {
        black_box(cached.list().unwrap());
    });

    let first = position::between(None, None).unwrap();
    let action = boards.move_action(card(carols[0]), "todo".into(), first.clone(), None);
    write_op(&repo, &carol, &id, tips.clone(), vec![action]);
    let fetched = time("cached get after a fetched operation", 1, || {
        black_box(cached.get(&id).unwrap());
    });
    let write = time("update through heartwood (two evaluations)", 1, || {
        let mut boards = Boards::open_cached(&*repo, WriteAs::new(&alice.signer), &path).unwrap();
        let action = boards.move_action(card(alices[0]), "todo".into(), first.clone(), None);
        black_box(boards.update(&alice.storage, &id, vec![action]).unwrap());
    });
    let after_write = time("cached get after our own write", 20, || {
        black_box(cached.get(&id).unwrap());
    });

    println!("\nsummary for {n_ops} operations:");
    println!(
        "  memoisation {:.1}x, warm cache {:.0}x over plain evaluation",
        unmemoised.as_secs_f64() / memoised.as_secs_f64(),
        unmemoised.as_secs_f64() / warm.as_secs_f64()
    );
    black_box((cold, list, fetched, write, after_write));
}
