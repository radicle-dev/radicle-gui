import type { RepoSeed } from "./types";

// beacon: a small Rust crate for signed peer announcements and gossip,
// maintained by Lumen Labs. The richest repository in the prototype.

const README = `# beacon

Signed peer announcements and gossip for small peer-to-peer networks.

beacon is the discovery layer we kept rewriting for every project at Lumen
Labs, finally pulled out into a crate. It answers two questions for a node:
*who is out there?* and *what do they have?* — without a tracker, a DHT or
any central server.

- **Signed announcements.** Every statement a peer makes is signed with its
  ed25519 key, so anyone can relay it and nobody can forge it.
- **Gossip, not flooding.** New announcements are relayed once; duplicates
  and stale messages are dropped on arrival.
- **Sans-I/O.** beacon never opens a socket. You feed it messages and it
  tells you what to send. Bring your own transport.
- **Small.** One dependency for crypto, no async runtime, no \`unsafe\`.

## Quick start

\`\`\`toml
[dependencies]
beacon = "0.1"
\`\`\`

\`\`\`rust
use beacon::{Announcement, Beacon, Config, Message, Payload};

let mut beacon = Beacon::new(Config::default());
beacon.connected(neighbour, now);

// Somebody told us abuot a peer.
let out = beacon.received(neighbour, Message::Announce(ann), now)?;

// Relay it to whoever beacon picked.
for (peer, msg) in out {
    transport.send(peer, msg);
}
\`\`\`

See [\`examples/announce.rs\`](examples/announce.rs) for a runnable version:

\`\`\`sh
cargo run --example announce
\`\`\`

## Status

Early. The wire format is not stable yet and will change before 1.0.
We run it on a handful of seed nodes and it hasn't caught fire, which is
the most we're willing to promise.

## License

MIT. See [LICENSE](LICENSE).
`;

const CARGO = `[package]
name = "beacon"
version = "0.1.0-dev"
edition = "2021"
rust-version = "1.70"
description = "Signed peer announcements and gossip for small peer-to-peer networks"
license = "MIT"
readme = "README.md"
keywords = ["p2p", "gossip", "discovery", "networking"]
categories = ["network-programming"]

[dependencies]
ed25519-dalek = { version = "2", features = ["rand_core"] }
log = "0.4"
thiserror = "1"

[dev-dependencies]
env_logger = "0.11"
rand = "0.8"
`;

const LICENSE = `MIT License

Copyright (c) 2026 The beacon contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const LIB = `//! # beacon
//!
//! Signed announcements and gossip for small peer-to-peer networks.
//!
//! A [\`Beacon\`] keeps track of the peers it knows about, stores the
//! announcements it has seen, and decides what to relay to whom. It does
//! no I/O: you feed it messages and it hands back the messages to send.
//! That keeps it easy to test and easy to embed.

pub mod gossip;
pub mod limiter;
pub mod message;
pub mod peer;
pub mod store;

pub use gossip::{Beacon, Config};
pub use message::{Announcement, Message, Payload};
pub use peer::{PeerId, PeerInfo};
pub use store::Store;

/// Errors returned by beacon.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid signature on announcement from {0}")]
    InvalidSignature(PeerId),
    #[error("announcement is too old (timestamp {0})")]
    Stale(u64),
    #[error("message too large: {size} bytes (max {max})")]
    TooLarge { size: usize, max: usize },
    #[error("rate limit exceeded for {0}")]
    RateLimited(PeerId),
}

/// Milliseconds since the Unix epoch.
pub type Timestamp = u64;
`;

const MESSAGE = `use ed25519_dalek::{Signature, Signer, SigningKey, Verifier};

use crate::peer::PeerId;
use crate::{Error, Timestamp};

/// Maximum encoded size of an announcement payload, in bytes.
pub const MAX_PAYLOAD_SIZE: usize = 4096;

/// What a peer is announcing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Payload {
    /// "I'm here, and this is how to reach me."
    Node { addrs: Vec<String>, alias: Option<String> },
    /// "I have these resources." Resources are opaque 32-byte ids.
    Inventory { items: Vec<[u8; 32]> },
}

impl Payload {
    /// Canonical byte encoding, used for signing.
    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        match self {
            Payload::Node { addrs, alias } => {
                buf.push(0x01);
                buf.push(addrs.len() as u8);
                for addr in addrs {
                    buf.push(addr.len() as u8);
                    buf.extend_from_slice(addr.as_bytes());
                }
                let alias = alias.as_deref().unwrap_or("");
                buf.push(alias.len() as u8);
                buf.extend_from_slice(alias.as_bytes());
            }
            Payload::Inventory { items } => {
                buf.push(0x02);
                buf.extend_from_slice(&(items.len() as u16).to_be_bytes());
                for item in items {
                    buf.extend_from_slice(item);
                }
            }
        }
        buf
    }
}

/// A signed, timestamped statement from a peer.
#[derive(Debug, Clone)]
pub struct Announcement {
    pub from: PeerId,
    pub timestamp: Timestamp,
    pub payload: Payload,
    pub signature: Signature,
}

impl Announcement {
    /// Create and sign a new announcement.
    pub fn new(key: &SigningKey, timestamp: Timestamp, payload: Payload) -> Self {
        let from = PeerId::from(key.verifying_key());
        let signature = key.sign(&Self::signed_bytes(timestamp, &payload));

        Self { from, timestamp, payload, signature }
    }

    /// Check the size limit and the signature.
    pub fn verify(&self) -> Result<(), Error> {
        let bytes = Self::signed_bytes(self.timestamp, &self.payload);
        if bytes.len() > MAX_PAYLOAD_SIZE {
            return Err(Error::TooLarge { size: bytes.len(), max: MAX_PAYLOAD_SIZE });
        }
        self.from
            .verifying_key()
            .verify(&bytes, &self.signature)
            .map_err(|_| Error::InvalidSignature(self.from))
    }

    fn signed_bytes(timestamp: Timestamp, payload: &Payload) -> Vec<u8> {
        let mut bytes = timestamp.to_be_bytes().to_vec();
        bytes.extend(payload.encode());
        bytes
    }
}

/// Messages exchanged between directly connected peers.
#[derive(Debug, Clone)]
pub enum Message {
    Announce(Announcement),
    /// Ask a peer for everything it has seen since a timestamp.
    Subscribe { since: Timestamp },
    Ping { nonce: u64 },
    Pong { nonce: u64 },
}
`;

const PEER = `use std::fmt;

use ed25519_dalek::VerifyingKey;

use crate::Timestamp;

/// A peer's public key.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct PeerId([u8; 32]);

impl PeerId {
    pub fn verifying_key(&self) -> VerifyingKey {
        // A PeerId can only be built from a valid key.
        VerifyingKey::from_bytes(&self.0).expect("PeerId holds a valid key")
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl From<VerifyingKey> for PeerId {
    fn from(key: VerifyingKey) -> Self {
        Self(key.to_bytes())
    }
}

impl fmt::Display for PeerId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for b in &self.0[..6] {
            write!(f, "{b:02x}")?;
        }
        Ok(())
    }
}

impl fmt::Debug for PeerId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "PeerId({self})")
    }
}

/// What we know about a peer.
#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub id: PeerId,
    pub addrs: Vec<String>,
    pub alias: Option<String>,
    /// When we last heard from or about this peer.
    pub last_seen: Timestamp,
    /// Whether we have a live connection to it.
    pub connected: bool,
}

impl PeerInfo {
    pub fn new(id: PeerId, now: Timestamp) -> Self {
        Self { id, addrs: Vec::new(), alias: None, last_seen: now, connected: false }
    }
}
`;

const STORE = `use std::collections::HashMap;

use crate::message::Announcement;
use crate::peer::PeerId;
use crate::Timestamp;

/// Keeps the latest announcement of each kind per peer.
#[derive(Debug, Default)]
pub struct Store {
    entries: HashMap<(PeerId, u8), Announcement>,
}

impl Store {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert an announcement. Returns \`true\` if it was new, ie. newer than
    /// what we had for the same peer and kind.
    pub fn insert(&mut self, ann: Announcement) -> bool {
        let key = (ann.from, kind(&ann));
        match self.entries.get(&key) {
            Some(existing) if existing.timestamp >= ann.timestamp => false,
            _ => {
                self.entries.insert(key, ann);
                true
            }
        }
    }

    /// Announcements newer than \`since\`, oldest first.
    pub fn since(&self, since: Timestamp) -> Vec<&Announcement> {
        let mut anns: Vec<_> = self
            .entries
            .values()
            .filter(|a| a.timestamp > since)
            .collect();
        anns.sort_by_key(|a| a.timestamp);
        anns
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

fn kind(ann: &Announcement) -> u8 {
    match ann.payload {
        crate::Payload::Node { .. } => 1,
        crate::Payload::Inventory { .. } => 2,
    }
}
`;

const LIMITER = `use std::collections::HashMap;

use crate::peer::PeerId;
use crate::Timestamp;

/// A very small per-peer rate limiter: at most \`limit\` messages per
/// \`window\` milliseconds.
#[derive(Debug)]
pub struct Limiter {
    limit: u32,
    window: Timestamp,
    counters: HashMap<PeerId, (Timestamp, u32)>,
}

impl Limiter {
    pub fn new(limit: u32, window: Timestamp) -> Self {
        Self { limit, window, counters: HashMap::new() }
    }

    /// Record a message from \`peer\` at \`now\`. Returns \`false\` if the peer
    /// is over its limit and the message should be dropped.
    pub fn allow(&mut self, peer: &PeerId, now: Timestamp) -> bool {
        let (start, count) = self.counters.entry(*peer).or_insert((now, 0));
        if now.saturating_sub(*start) >= self.window {
            *start = now;
            *count = 0;
        }
        *count += 1;
        *count <= self.limit
    }
}
`;

const GOSSIP = `use std::collections::HashMap;

use log::{debug, trace};

use crate::limiter::Limiter;
use crate::message::{Announcement, Message, Payload};
use crate::peer::{PeerId, PeerInfo};
use crate::store::Store;
use crate::{Error, Timestamp};

/// Tunables for a [\`Beacon\`].
#[derive(Debug, Clone)]
pub struct Config {
    /// Announcements older than this (ms) are dropped on arrival.
    pub max_age: Timestamp,
    /// Messages per peer per \`rate_window\`.
    pub rate_limit: u32,
    pub rate_window: Timestamp,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_age: 60 * 60 * 1000,
            rate_limit: 64,
            rate_window: 1000,
        }
    }
}

/// The gossip state machine. Feed it messages, get back messages to send.
pub struct Beacon {
    config: Config,
    peers: HashMap<PeerId, PeerInfo>,
    store: Store,
    limiter: Limiter,
}

impl Beacon {
    pub fn new(config: Config) -> Self {
        let limiter = Limiter::new(config.rate_limit, config.rate_window);
        Self { config, peers: HashMap::new(), store: Store::new(), limiter }
    }

    pub fn peers(&self) -> impl Iterator<Item = &PeerInfo> {
        self.peers.values()
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    pub fn connected(&mut self, peer: PeerId, now: Timestamp) {
        let info = self.peers.entry(peer).or_insert_with(|| PeerInfo::new(peer, now));
        info.connected = true;
        info.last_seen = now;
    }

    pub fn disconnected(&mut self, peer: &PeerId) {
        if let Some(info) = self.peers.get_mut(peer) {
            info.connected = false;
        }
    }

    /// Handle a message from a directly connected peer. Returns the messages
    /// to send, as (recipient, message) pairs.
    pub fn received(
        &mut self,
        from: PeerId,
        msg: Message,
        now: Timestamp,
    ) -> Result<Vec<(PeerId, Message)>, Error> {
        if !self.limiter.allow(&from, now) {
            return Err(Error::RateLimited(from));
        }
        match msg {
            Message::Announce(ann) => self.announced(from, ann, now),
            Message::Subscribe { since } => Ok(self
                .store
                .since(since)
                .into_iter()
                .map(|a| (from, Message::Announce(a.clone())))
                .collect()),
            Message::Ping { nonce } => Ok(vec![(from, Message::Pong { nonce })]),
            Message::Pong { .. } => Ok(vec![]),
        }
    }

    fn announced(
        &mut self,
        relayer: PeerId,
        ann: Announcement,
        now: Timestamp,
    ) -> Result<Vec<(PeerId, Message)>, Error> {
        if now.saturating_sub(ann.timestamp) > self.config.max_age {
            return Err(Error::Stale(ann.timestamp));
        }
        ann.verify()?;

        let origin = ann.from;
        let info = self.peers.entry(origin).or_insert_with(|| PeerInfo::new(origin, now));
        info.last_seen = now;
        if let Payload::Node { addrs, alias } = &ann.payload {
            info.addrs = addrs.clone();
            info.alias = alias.clone();
        }

        if !self.store.insert(ann.clone()) {
            trace!("already have announcement from {origin}");
            return Ok(vec![]);
        }
        debug!("new announcement from {origin} via {relayer}");

        // Relay to every connected peer except the one we got it from and
        // the origin itself.
        Ok(self
            .peers
            .values()
            .filter(|p| p.connected && p.id != relayer && p.id != origin)
            .map(|p| (p.id, Message::Announce(ann.clone())))
            .collect())
    }
}
`;

const TESTS = `use beacon::{Announcement, Beacon, Config, Message, Payload, PeerId};
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;

fn peer() -> (SigningKey, PeerId) {
    let key = SigningKey::generate(&mut OsRng);
    let id = PeerId::from(key.verifying_key());
    (key, id)
}

fn node_ann(key: &SigningKey, ts: u64) -> Announcement {
    Announcement::new(
        key,
        ts,
        Payload::Node { addrs: vec!["10.0.0.1:8776".into()], alias: Some("test".into()) },
    )
}

#[test]
fn relays_new_announcements() {
    let mut beacon = Beacon::new(Config::default());
    let (_, alice) = peer();
    let (_, bob) = peer();
    let (carol_key, carol) = peer();

    beacon.connected(alice, 1_000);
    beacon.connected(bob, 1_000);

    let ann = node_ann(&carol_key, 1_000);
    let out = beacon.received(alice, Message::Announce(ann), 1_500).unwrap();

    assert_eq!(out.len(), 1);
    assert_eq!(out[0].0, bob);
    assert!(beacon.peers().any(|p| p.id == carol));
}

#[test]
fn ignores_duplicates() {
    let mut beacon = Beacon::new(Config::default());
    let (_, alice) = peer();
    let (_, bob) = peer();
    let (carol_key, _) = peer();

    beacon.connected(alice, 0);
    beacon.connected(bob, 0);

    let ann = node_ann(&carol_key, 10);
    beacon.received(alice, Message::Announce(ann.clone()), 20).unwrap();
    let out = beacon.received(bob, Message::Announce(ann), 30).unwrap();

    assert!(out.is_empty());
}

#[test]
fn rejects_stale_announcements() {
    let mut beacon = Beacon::new(Config::default());
    let (_, alice) = peer();
    let (carol_key, _) = peer();

    let ann = node_ann(&carol_key, 0);
    let hour = 60 * 60 * 1000;
    let err = beacon.received(alice, Message::Announce(ann), 2 * hour);

    assert!(matches!(err, Err(beacon::Error::Stale(0))));
}
`;

const EXAMPLE = `//! Announce ourselves to a (simulated) neighbour and print what gets relayed.
//!
//!     cargo run --example announce

use beacon::{Announcement, Beacon, Config, Message, Payload, PeerId};
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;

fn main() {
    env_logger::init();

    let me = SigningKey::generate(&mut OsRng);
    let neighbour = PeerId::from(SigningKey::generate(&mut OsRng).verifying_key());
    let other = PeerId::from(SigningKey::generate(&mut OsRng).verifying_key());

    let mut beacon = Beacon::new(Config::default());
    beacon.connected(neighbour, 0);
    beacon.connected(other, 0);

    let ann = Announcement::new(
        &me,
        1,
        Payload::Node {
            addrs: vec!["192.168.1.20:8776".to_owned()],
            alias: Some("closet-seed".to_owned()),
        },
    );

    let out = beacon
        .received(neighbour, Message::Announce(ann), 2)
        .expect("announcement is valid");

    for (to, msg) in out {
        println!("-> {to}: {msg:?}");
    }
    println!("known peers: {}", beacon.peers().count());
}
`;

const GITIGNORE = `/target
Cargo.lock
*.swp
.DS_Store
`;

const CHANGELOG = `# Changelog

All notable changes to this project are documented here. The format is
loosely based on Keep a Changelog, and the project follows semantic
versioning (with the usual 0.x caveats).

## Unreleased

- Initial gossip state machine, signed announcements and in-memory store.
`;

const CI_CHECK = `#!/bin/sh
# Run by CI on every push and patch revision. Keep it boring.
set -eu

cargo fmt --all -- --check
cargo build --all-targets
cargo test --all-targets
cargo test --doc
`;

const LIMITER_TOKEN_BUCKET = `use std::collections::HashMap;

use crate::peer::PeerId;
use crate::Timestamp;

/// Per-peer token bucket.
///
/// Each peer gets a bucket holding up to \`burst\` tokens, refilled at \`rate\`
/// tokens per second. Every message costs one token. Unlike a fixed window,
/// this doesn't let a peer send twice its limit across a window boundary.
#[derive(Debug)]
pub struct Limiter {
    rate: f64,
    burst: f64,
    buckets: HashMap<PeerId, Bucket>,
}

#[derive(Debug, Clone, Copy)]
struct Bucket {
    tokens: f64,
    refilled_at: Timestamp,
}

impl Limiter {
    /// \`rate\` is in tokens per second, \`burst\` is the bucket size.
    pub fn new(rate: u32, burst: u32) -> Self {
        Self { rate: rate as f64, burst: burst as f64, buckets: HashMap::new() }
    }

    /// Take a token for a message from \`peer\` at \`now\`. Returns \`false\` if
    /// the bucket is empty and the message should be dropped.
    pub fn allow(&mut self, peer: &PeerId, now: Timestamp) -> bool {
        let burst = self.burst;
        let bucket = self
            .buckets
            .entry(*peer)
            .or_insert(Bucket { tokens: burst, refilled_at: now });

        let elapsed = now.saturating_sub(bucket.refilled_at) as f64 / 1000.0;
        bucket.tokens = (bucket.tokens + elapsed * self.rate).min(burst);
        bucket.refilled_at = now;

        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            true
        } else {
            false
        }
    }

    /// Forget peers whose buckets are full again; they're indistinguishable
    /// from peers we've never seen, so there's no point keeping them.
    pub fn sweep(&mut self, now: Timestamp) {
        let (rate, burst) = (self.rate, self.burst);
        self.buckets.retain(|_, b| {
            let elapsed = now.saturating_sub(b.refilled_at) as f64 / 1000.0;
            b.tokens + elapsed * rate < burst
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;

    fn peer() -> PeerId {
        PeerId::from(SigningKey::from_bytes(&[7; 32]).verifying_key())
    }

    #[test]
    fn allows_burst_then_refills() {
        let mut limiter = Limiter::new(10, 3);
        let p = peer();

        assert!(limiter.allow(&p, 0));
        assert!(limiter.allow(&p, 0));
        assert!(limiter.allow(&p, 0));
        assert!(!limiter.allow(&p, 0));
        // 100ms at 10 tokens/s buys exactly one more message.
        assert!(limiter.allow(&p, 100));
        assert!(!limiter.allow(&p, 100));
    }
}
`;

const WIRE = `//! A small, length-prefixed binary encoding for [\`Message\`].
//!
//! Frame layout: a \`u32\` big-endian length, then a one-byte tag, then the
//! body. Announcement payloads reuse [\`Payload::encode\`], so what goes over
//! the wire is exactly what was signed.

use ed25519_dalek::Signature;

use crate::message::{Announcement, Message, Payload};
use crate::peer::PeerId;

/// Decoding errors.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DecodeError {
    #[error("unexpected end of input")]
    Eof,
    #[error("unknown message tag {0:#04x}")]
    UnknownTag(u8),
    #[error("invalid public key")]
    InvalidKey,
    #[error("invalid utf-8 in string field")]
    InvalidUtf8,
}

const TAG_ANNOUNCE: u8 = 0x01;
const TAG_SUBSCRIBE: u8 = 0x02;
const TAG_PING: u8 = 0x03;
const TAG_PONG: u8 = 0x04;

/// Encode a message into a length-prefixed frame.
pub fn encode(msg: &Message) -> Vec<u8> {
    let mut body = Vec::new();
    match msg {
        Message::Announce(ann) => {
            body.push(TAG_ANNOUNCE);
            body.extend_from_slice(ann.from.as_bytes());
            body.extend_from_slice(&ann.timestamp.to_be_bytes());
            body.extend_from_slice(&ann.signature.to_bytes());
            body.extend(ann.payload.encode());
        }
        Message::Subscribe { since } => {
            body.push(TAG_SUBSCRIBE);
            body.extend_from_slice(&since.to_be_bytes());
        }
        Message::Ping { nonce } => {
            body.push(TAG_PING);
            body.extend_from_slice(&nonce.to_be_bytes());
        }
        Message::Pong { nonce } => {
            body.push(TAG_PONG);
            body.extend_from_slice(&nonce.to_be_bytes());
        }
    }
    let mut frame = (body.len() as u32).to_be_bytes().to_vec();
    frame.extend(body);
    frame
}

/// Decode one message body (without the length prefix).
pub fn decode(mut buf: &[u8]) -> Result<Message, DecodeError> {
    match take::<1>(&mut buf)?[0] {
        TAG_ANNOUNCE => {
            let from = PeerId::try_from(take::<32>(&mut buf)?).map_err(|_| DecodeError::InvalidKey)?;
            let timestamp = u64::from_be_bytes(take::<8>(&mut buf)?);
            let signature = Signature::from_bytes(&take::<64>(&mut buf)?);
            let payload = decode_payload(&mut buf)?;
            Ok(Message::Announce(Announcement { from, timestamp, payload, signature }))
        }
        TAG_SUBSCRIBE => Ok(Message::Subscribe { since: u64::from_be_bytes(take::<8>(&mut buf)?) }),
        TAG_PING => Ok(Message::Ping { nonce: u64::from_be_bytes(take::<8>(&mut buf)?) }),
        TAG_PONG => Ok(Message::Pong { nonce: u64::from_be_bytes(take::<8>(&mut buf)?) }),
        tag => Err(DecodeError::UnknownTag(tag)),
    }
}

fn decode_payload(buf: &mut &[u8]) -> Result<Payload, DecodeError> {
    match take::<1>(buf)?[0] {
        0x01 => {
            let n = take::<1>(buf)?[0];
            let mut addrs = Vec::with_capacity(n as usize);
            for _ in 0..n {
                addrs.push(string(buf)?);
            }
            let alias = string(buf)?;
            let alias = (!alias.is_empty()).then_some(alias);
            Ok(Payload::Node { addrs, alias })
        }
        0x02 => {
            let n = u16::from_be_bytes(take::<2>(buf)?);
            let mut items = Vec::with_capacity(n as usize);
            for _ in 0..n {
                items.push(take::<32>(buf)?);
            }
            Ok(Payload::Inventory { items })
        }
        tag => Err(DecodeError::UnknownTag(tag)),
    }
}

fn string(buf: &mut &[u8]) -> Result<String, DecodeError> {
    let len = take::<1>(buf)?[0] as usize;
    if buf.len() < len {
        return Err(DecodeError::Eof);
    }
    let (s, rest) = buf.split_at(len);
    *buf = rest;
    String::from_utf8(s.to_vec()).map_err(|_| DecodeError::InvalidUtf8)
}

fn take<const N: usize>(buf: &mut &[u8]) -> Result<[u8; N], DecodeError> {
    if buf.len() < N {
        return Err(DecodeError::Eof);
    }
    let (head, rest) = buf.split_at(N);
    *buf = rest;
    Ok(head.try_into().expect("length checked"))
}
`;

const STORE_INDEXED = `use std::collections::{BTreeMap, HashMap};
use std::ops::Bound;

use crate::message::Announcement;
use crate::peer::PeerId;
use crate::Timestamp;

type Key = (PeerId, u8);

/// Keeps the latest announcement of each kind per peer.
///
/// Entries are also indexed by timestamp, so answering a \`Subscribe\` and
/// pruning only touch the entries that are actually in range, instead of
/// scanning and sorting the whole store every time.
#[derive(Debug, Default)]
pub struct Store {
    entries: HashMap<Key, Announcement>,
    by_time: BTreeMap<Timestamp, Vec<Key>>,
}

impl Store {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert an announcement. Returns \`true\` if it was new, ie. newer than
    /// what we had for the same peer and kind.
    pub fn insert(&mut self, ann: Announcement) -> bool {
        let key = (ann.from, kind(&ann));
        if let Some(old) = self.entries.get(&key).map(|a| a.timestamp) {
            if old >= ann.timestamp {
                return false;
            }
            self.unindex(old, &key);
        }
        self.by_time.entry(ann.timestamp).or_default().push(key);
        self.entries.insert(key, ann);
        true
    }

    /// Announcements newer than \`since\`, oldest first.
    pub fn since(&self, since: Timestamp) -> Vec<&Announcement> {
        self.by_time
            .range((Bound::Excluded(since), Bound::Unbounded))
            .flat_map(|(_, keys)| keys.iter())
            .filter_map(|key| self.entries.get(key))
            .collect()
    }

    /// Drop announcements older than \`cutoff\`. Returns how many were removed.
    pub fn prune(&mut self, cutoff: Timestamp) -> usize {
        let keep = self.by_time.split_off(&cutoff);
        let expired = std::mem::replace(&mut self.by_time, keep);
        let mut removed = 0;
        for key in expired.into_values().flatten() {
            self.entries.remove(&key);
            removed += 1;
        }
        removed
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn unindex(&mut self, ts: Timestamp, key: &Key) {
        if let Some(keys) = self.by_time.get_mut(&ts) {
            keys.retain(|k| k != key);
            if keys.is_empty() {
                self.by_time.remove(&ts);
            }
        }
    }
}

fn kind(ann: &Announcement) -> u8 {
    match ann.payload {
        crate::Payload::Node { .. } => 1,
        crate::Payload::Inventory { .. } => 2,
    }
}
`;

const TESTS_STORE = `//! Property tests for the announcement store.

use beacon::{Announcement, Payload, Store};
use ed25519_dalek::SigningKey;
use proptest::prelude::*;

fn ann(seed: u8, ts: u64) -> Announcement {
    let key = SigningKey::from_bytes(&[seed; 32]);
    Announcement::new(&key, ts, Payload::Inventory { items: vec![] })
}

fn inserts() -> impl Strategy<Value = Vec<(u8, u64)>> {
    prop::collection::vec((0u8..16, 0u64..1_000), 0..200)
}

proptest! {
    #[test]
    fn since_is_sorted_and_strict(inserts in inserts(), cursor in 0u64..1_000) {
        let mut store = Store::new();
        for (seed, ts) in inserts {
            store.insert(ann(seed, ts));
        }
        let out = store.since(cursor);
        prop_assert!(out.windows(2).all(|w| w[0].timestamp <= w[1].timestamp));
        prop_assert!(out.iter().all(|a| a.timestamp > cursor));
    }

    #[test]
    fn prune_keeps_only_recent(inserts in inserts(), cutoff in 0u64..1_000) {
        let mut store = Store::new();
        for (seed, ts) in inserts {
            store.insert(ann(seed, ts));
        }
        let before = store.len();
        let removed = store.prune(cutoff);
        prop_assert_eq!(before - removed, store.len());
        prop_assert!(store.since(0).iter().all(|a| a.timestamp >= cutoff));
    }
}
`;

const EXAMPLE_UDP = `//! Two beacons gossiping over UDP on localhost.
//!
//!     cargo run --example udp -- 9000 9001
//!     cargo run --example udp -- 9001 9000
//!
//! WIP: no retransmits, and frames larger than one datagram are dropped.

use std::net::UdpSocket;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use beacon::{wire, Announcement, Beacon, Config, Message, Payload, PeerId};
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

fn main() -> std::io::Result<()> {
    let mut args = std::env::args().skip(1);
    let port: u16 = args.next().and_then(|a| a.parse().ok()).unwrap_or(9000);
    let peer_port: u16 = args.next().and_then(|a| a.parse().ok()).unwrap_or(9001);

    let socket = UdpSocket::bind(("127.0.0.1", port))?;
    socket.set_read_timeout(Some(Duration::from_secs(1)))?;

    let key = SigningKey::generate(&mut OsRng);
    // TODO: we don't know the remote's key until it announces itself, so
    // for now every datagram is attributed to a placeholder id.
    let remote = PeerId::from(SigningKey::from_bytes(&[0; 32]).verifying_key());

    let mut beacon = Beacon::new(Config::default());
    beacon.connected(remote, now());

    let hello = Announcement::new(
        &key,
        now(),
        Payload::Node { addrs: vec![format!("127.0.0.1:{port}")], alias: None },
    );
    socket.send_to(&wire::encode(&Message::Announce(hello)), ("127.0.0.1", peer_port))?;

    let mut buf = [0u8; 1500];
    loop {
        match socket.recv_from(&mut buf) {
            Ok((n, from)) => {
                let Ok(msg) = wire::decode(&buf[4..n]) else {
                    eprintln!("bad frame from {from}");
                    continue;
                };
                match beacon.received(remote, msg, now()) {
                    Ok(out) => println!("{} message(s) to relay", out.len()),
                    Err(e) => eprintln!("rejected: {e}"),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => beacon.tick(now()),
            Err(e) => return Err(e),
        }
    }
}
`;

export const beacon: RepoSeed = {
  owner: { org: "lumen-labs" },
  name: "beacon",
  description:
    "Signed peer announcements and gossip for small peer-to-peer networks. Sans-I/O, no central server.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["self", "ada", "tomas"],
  threshold: 2,
  seeding: 41,
  files: {
    "README.md": README,
    "Cargo.toml": CARGO,
    LICENSE: LICENSE,
    ".gitignore": GITIGNORE,
    "CHANGELOG.md": CHANGELOG,
    "src/lib.rs": LIB,
    "src/message.rs": MESSAGE,
    "src/peer.rs": PEER,
    "src/store.rs": STORE,
    "src/gossip.rs": GOSSIP,
    "src/limiter.rs": LIMITER,
    "tests/gossip.rs": TESTS,
    "examples/announce.rs": EXAMPLE,
  },
  root: {
    label: "root",
    message: `Initial import of beacon

Pulls the discovery code out of the two projects that had grown their own
copies of it. What's here:

- signed Node and Inventory announcements (ed25519)
- an in-memory store keeping the newest announcement per peer and kind
- a sans-I/O gossip state machine with a basic per-peer rate limit
- a couple of integration tests and a runnable example`,
    author: "ada",
    daysAgo: 201,
  },
  history: [
    {
      label: "ci",
      message: `ci: add check script

One script that CI and humans both run, so "works on my machine" and
"works in CI" mean the same thing.`,
      author: "ada",
      daysAgo: 197,
      changes: {
        "ci/check.sh": CI_CHECK,
      },
    },
    {
      label: "prune",
      message: `store: prune announcements older than max_age

Until now the store only ever grew. Add Store::prune and a Beacon::tick
entry point that callers are expected to invoke every few seconds; it is
also where future housekeeping will go.`,
      author: "tomas",
      daysAgo: 189,
      changes: {
        "src/store.rs": [
          [
            "    pub fn len(&self) -> usize {",
            `    /// Drop announcements older than \`cutoff\`. Returns how many were removed.
    pub fn prune(&mut self, cutoff: Timestamp) -> usize {
        let before = self.entries.len();
        self.entries.retain(|_, a| a.timestamp >= cutoff);
        before - self.entries.len()
    }

    pub fn len(&self) -> usize {`,
          ],
        ],
        "src/gossip.rs": [
          [
            "    pub fn connected(&mut self, peer: PeerId, now: Timestamp) {",
            `    /// Periodic housekeeping. Call this every few seconds.
    pub fn tick(&mut self, now: Timestamp) {
        let pruned = self.store.prune(now.saturating_sub(self.config.max_age));
        if pruned > 0 {
            debug!("pruned {pruned} stale announcement(s)");
        }
    }

    pub fn connected(&mut self, peer: PeerId, now: Timestamp) {`,
          ],
        ],
      },
    },
    {
      label: "future",
      message: `gossip: reject announcements from the future

A peer with a clock running ahead could publish an announcement that
nobody else can ever supersede until real time catches up. Reject
timestamps more than Config::max_drift (default 30s) ahead of ours.`,
      author: "ada",
      daysAgo: 182,
      changes: {
        "src/lib.rs": [
          [
            `    #[error("rate limit exceeded for {0}")]`,
            `    #[error("announcement timestamp {0} is in the future")]
    FromFuture(u64),
    #[error("rate limit exceeded for {0}")]`,
          ],
        ],
        "src/gossip.rs": [
          [
            "    /// Messages per peer per `rate_window`.",
            `    /// How far ahead of our clock (ms) a timestamp may be, to allow for skew.
    pub max_drift: Timestamp,
    /// Messages per peer per \`rate_window\`.`,
          ],
          [
            "            rate_limit: 64,",
            `            max_drift: 30 * 1000,
            rate_limit: 64,`,
          ],
          [
            "        ann.verify()?;",
            `        if ann.timestamp > now + self.config.max_drift {
            return Err(Error::FromFuture(ann.timestamp));
        }
        ann.verify()?;`,
          ],
        ],
      },
    },
    {
      label: "readme-arch",
      message: `docs: explain how a message flows through beacon

Adds a "How it works" section to the README. Several people asked where
the relay decision is made; this should answer that without reading
gossip.rs.`,
      author: "yuki",
      daysAgo: 174,
      changes: {
        "README.md": [
          [
            "## Status\n",
            `## How it works

\`\`\`text
          ┌──────────── Beacon ─────────────┐
 Message ─►  limiter ─► verify ─► store ────┼─► (peer, Message)*
          │                        │        │
          │                    peers table  │
          └─────────────────────────────────┘
\`\`\`

1. **Limiter.** Each peer gets a budget of messages per window; anything
   over it is dropped before we spend CPU on signatures.
2. **Verify.** Announcements older than \`Config::max_age\`, or too far in
   the future, are rejected. Then the signature is checked.
3. **Store.** We keep only the newest announcement of each kind per peer.
   If the store already had it, we stop here: that's how gossip terminates.
4. **Relay.** Anything new is forwarded to every connected peer except the
   one we heard it from and the original author.

Call \`Beacon::tick\` every few seconds to prune old announcements.

## Status
`,
          ],
        ],
      },
    },
    {
      label: "tests-future",
      message: `test: cover future timestamps and pruning`,
      author: "tomas",
      daysAgo: 167,
      changes: {
        "tests/gossip.rs": [
          [
            "    assert!(matches!(err, Err(beacon::Error::Stale(0))));\n}\n",
            `    assert!(matches!(err, Err(beacon::Error::Stale(0))));
}

#[test]
fn rejects_announcements_from_the_future() {
    let mut beacon = Beacon::new(Config::default());
    let (_, alice) = peer();
    let (carol_key, _) = peer();

    let ann = node_ann(&carol_key, 120_000);
    let err = beacon.received(alice, Message::Announce(ann), 1_000);

    assert!(matches!(err, Err(beacon::Error::FromFuture(120_000))));
}

#[test]
fn tick_prunes_old_announcements() {
    let mut beacon = Beacon::new(Config::default());
    let (_, alice) = peer();
    let (carol_key, _) = peer();

    beacon.connected(alice, 0);
    beacon.received(alice, Message::Announce(node_ann(&carol_key, 0)), 0).unwrap();
    assert_eq!(beacon.store().len(), 1);

    beacon.tick(2 * 60 * 60 * 1000);
    assert!(beacon.store().is_empty());
}
`,
          ],
        ],
      },
    },
    {
      label: "v0.1",
      message: `release: v0.1.0

First tagged release. The API will still move, but people are already
depending on git revisions, and a version number is kinder.`,
      author: "ada",
      daysAgo: 161,
      changes: {
        "Cargo.toml": [['version = "0.1.0-dev"', 'version = "0.1.0"']],
        "CHANGELOG.md": [
          [
            "## Unreleased\n\n- Initial gossip state machine, signed announcements and in-memory store.\n",
            `## Unreleased

## 0.1.0

- Initial gossip state machine, signed announcements and in-memory store.
- \`Beacon::tick\` prunes announcements older than \`Config::max_age\`.
- Announcements more than \`Config::max_drift\` in the future are rejected.
`,
          ],
        ],
      },
    },
    {
      label: "ci-clippy",
      message: `ci: run clippy with -D warnings and check the MSRV

We claim rust-version = 1.70 in Cargo.toml but nothing verified it. The
MSRV check only builds the library; dev-dependencies are allowed to
need something newer.`,
      author: "kofi",
      daysAgo: 154,
      changes: {
        "ci/check.sh": [
          [
            "cargo build --all-targets\n",
            "cargo clippy --all-targets -- -D warnings\ncargo build --all-targets\n",
          ],
          [
            "cargo test --doc\n",
            `cargo test --doc

# Minimum supported Rust version; keep in sync with Cargo.toml.
cargo +1.70 check --lib
`,
          ],
        ],
      },
    },
    {
      label: "peer-timeout",
      message: `gossip: forget peers we haven't heard about in a day

The peers table never shrank, so a long-running seed node accumulated
every key that was ever announced to it, and the relay loop got slower
and slower. Drop disconnected peers whose last_seen is older than
Config::peer_timeout (default 24h) on tick.

Fixes the CPU creep reported on the closet seed.`,
      author: "yuki",
      daysAgo: 147,
      changes: {
        "src/peer.rs": [
          [
            "        Self { id, addrs: Vec::new(), alias: None, last_seen: now, connected: false }\n    }\n",
            `        Self { id, addrs: Vec::new(), alias: None, last_seen: now, connected: false }
    }

    /// A peer we're not connected to and haven't heard about for \`timeout\`.
    pub fn is_stale(&self, now: Timestamp, timeout: Timestamp) -> bool {
        !self.connected && now.saturating_sub(self.last_seen) > timeout
    }
`,
          ],
        ],
        "src/gossip.rs": [
          [
            "    pub rate_window: Timestamp,\n}",
            `    pub rate_window: Timestamp,
    /// Disconnected peers we haven't heard about for this long are dropped.
    pub peer_timeout: Timestamp,
}`,
          ],
          [
            "            rate_window: 1000,\n",
            "            rate_window: 1000,\n            peer_timeout: 24 * 60 * 60 * 1000,\n",
          ],
          [
            '            debug!("pruned {pruned} stale announcement(s)");\n        }\n',
            `            debug!("pruned {pruned} stale announcement(s)");
        }

        let timeout = self.config.peer_timeout;
        self.peers.retain(|_, p| !p.is_stale(now, timeout));
`,
          ],
        ],
      },
    },
    {
      label: "doc-example",
      message: `docs: add a doctest to Announcement::new`,
      author: "lena",
      daysAgo: 140,
      changes: {
        "src/message.rs": [
          [
            "    /// Create and sign a new announcement.\n",
            `    /// Create and sign a new announcement.
    ///
    /// \`\`\`
    /// use beacon::{Announcement, Payload};
    /// use ed25519_dalek::SigningKey;
    ///
    /// let key = SigningKey::from_bytes(&[42; 32]);
    /// let ann = Announcement::new(&key, 1_700_000_000_000, Payload::Inventory { items: vec![] });
    /// assert!(ann.verify().is_ok());
    /// \`\`\`
`,
          ],
        ],
      },
    },
    {
      label: "example-output",
      message: `examples: print relayed announcements readably

The Debug output of a whole Announcement includes 64 bytes of signature,
which is not what anyone running the example wants to look at.`,
      author: "oskar",
      daysAgo: 132,
      changes: {
        "examples/announce.rs": [
          [
            '        println!("-> {to}: {msg:?}");\n',
            `        match msg {
            Message::Announce(ann) => {
                println!("relay to {to}: announcement from {} @ {}", ann.from, ann.timestamp)
            }
            other => println!("send to {to}: {other:?}"),
        }
`,
          ],
        ],
      },
    },
    {
      label: "token-bucket",
      message: `limiter: replace fixed window with a token bucket

The fixed-window counter let a peer send 2x its limit by straddling a
window boundary (see the issue about burst at window edges). A token
bucket refills continuously and has no edges.

Buckets that have refilled completely are swept on tick, so idle peers
don't cost memory.`,
      author: "yuki",
      daysAgo: 122,
      changes: {
        "src/limiter.rs": LIMITER_TOKEN_BUCKET,
        "src/gossip.rs": [
          [
            "    pub fn tick(&mut self, now: Timestamp) {\n",
            "    pub fn tick(&mut self, now: Timestamp) {\n        self.limiter.sweep(now);\n",
          ],
        ],
      },
    },
    {
      label: "rate-limit-merged",
      message: `gossip: configure the limiter with rate and burst

Config::rate_limit/rate_window no longer describe what the limiter does.
Replace them with \`rate\` (messages per second) and \`burst\`. Defaults are
32/s with a burst of 128, which comfortably covers a full Subscribe
replay from a busy peer.

BREAKING: Config::rate_limit and Config::rate_window are gone.`,
      author: "yuki",
      daysAgo: 121,
      changes: {
        "src/gossip.rs": [
          [
            "    /// Messages per peer per `rate_window`.\n    pub rate_limit: u32,\n    pub rate_window: Timestamp,\n",
            `    /// Sustained messages per second allowed from each peer.
    pub rate: u32,
    /// How many messages a peer may send in a burst.
    pub burst: u32,
`,
          ],
          [
            "            rate_limit: 64,\n            rate_window: 1000,\n",
            "            rate: 32,\n            burst: 128,\n",
          ],
          [
            "Limiter::new(config.rate_limit, config.rate_window)",
            "Limiter::new(config.rate, config.burst)",
          ],
        ],
        "README.md": [
          [
            "1. **Limiter.** Each peer gets a budget of messages per window; anything\n   over it is dropped before we spend CPU on signatures.",
            "1. **Limiter.** Each peer gets a token bucket (`Config::rate`, `Config::burst`);\n   messages over budget are dropped before we spend CPU on signatures.",
          ],
        ],
      },
    },
    {
      label: "wire-codec",
      message: `wire: add a binary encoding for Message

beacon was sans-I/O to a fault: every user had to invent their own
framing, and two of them got the signature bytes wrong. This adds a
small length-prefixed format in beacon::wire. Payloads reuse
Payload::encode, so the bytes on the wire are the bytes that were
signed.

PeerId gains TryFrom<[u8; 32]> so decoding can validate keys.`,
      author: "kofi",
      daysAgo: 111,
      changes: {
        "src/wire.rs": WIRE,
        "src/lib.rs": [["pub mod store;\n", "pub mod store;\npub mod wire;\n"]],
        "src/peer.rs": [
          [
            "impl fmt::Display for PeerId {",
            `impl TryFrom<[u8; 32]> for PeerId {
    type Error = ed25519_dalek::SignatureError;

    fn try_from(bytes: [u8; 32]) -> Result<Self, Self::Error> {
        VerifyingKey::from_bytes(&bytes).map(Self::from)
    }
}

impl fmt::Display for PeerId {`,
          ],
        ],
      },
    },
    {
      label: "wire-bounds",
      message: `wire: don't trust length prefixes for preallocation

An inventory header claiming 65535 items made us allocate ~2 MiB before
reading a single item. Cap the preallocation and let the Vec grow if the
items are really there. Adds roundtrip and hostile-length tests.

Reported-by: tomas`,
      author: "kofi",
      daysAgo: 109,
      changes: {
        "src/wire.rs": [
          [
            "const TAG_PONG: u8 = 0x04;\n",
            `const TAG_PONG: u8 = 0x04;

/// Never preallocate more than this many items based on a length prefix.
const MAX_PREALLOC: usize = 128;
`,
          ],
          [
            "            let mut items = Vec::with_capacity(n as usize);\n",
            "            let mut items = Vec::with_capacity((n as usize).min(MAX_PREALLOC));\n",
          ],
          [
            '    Ok(head.try_into().expect("length checked"))\n}\n',
            `    Ok(head.try_into().expect("length checked"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;

    #[test]
    fn roundtrip_announce() {
        let key = SigningKey::from_bytes(&[1; 32]);
        let ann = Announcement::new(&key, 42, Payload::Inventory { items: vec![[9; 32]; 3] });
        let frame = encode(&Message::Announce(ann.clone()));

        match decode(&frame[4..]).unwrap() {
            Message::Announce(decoded) => {
                assert_eq!(decoded.payload, ann.payload);
                assert!(decoded.verify().is_ok());
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn huge_inventory_length_is_rejected_cheaply() {
        // Tag, key, timestamp, signature, then an inventory claiming 65535 items.
        let key = SigningKey::from_bytes(&[1; 32]);
        let mut buf = vec![TAG_ANNOUNCE];
        buf.extend_from_slice(key.verifying_key().as_bytes());
        buf.extend_from_slice(&0u64.to_be_bytes());
        buf.extend_from_slice(&[0; 64]);
        buf.extend_from_slice(&[0x02, 0xff, 0xff]);

        assert_eq!(decode(&buf).unwrap_err(), DecodeError::Eof);
    }
}
`,
          ],
        ],
      },
    },
    {
      label: "v0.2",
      message: `release: v0.2.0`,
      author: "tomas",
      daysAgo: 97,
      changes: {
        "Cargo.toml": [['version = "0.1.0"', 'version = "0.2.0"']],
        "README.md": [['beacon = "0.1"', 'beacon = "0.2"']],
        "CHANGELOG.md": [
          [
            "## Unreleased\n\n",
            `## Unreleased

## 0.2.0

- **Breaking:** the rate limiter is now a token bucket. \`Config::rate_limit\`
  and \`Config::rate_window\` are replaced by \`Config::rate\` and
  \`Config::burst\`.
- New \`beacon::wire\` module with a length-prefixed binary encoding.
- Disconnected peers are forgotten after \`Config::peer_timeout\`.
- \`PeerId\` implements \`TryFrom<[u8; 32]>\`.

`,
          ],
        ],
      },
    },
    {
      label: "stats",
      message: `gossip: count received, relayed, duplicate and rejected messages

Exposed as Beacon::stats(). Cheap enough to always keep, and it makes
"is gossip actually converging?" a question you can answer from a
dashboard instead of from logs.`,
      author: "tomas",
      daysAgo: 85,
      changes: {
        "src/lib.rs": [
          ["pub use gossip::{Beacon, Config};", "pub use gossip::{Beacon, Config, Stats};"],
        ],
        "src/gossip.rs": [
          [
            "/// The gossip state machine.",
            `/// Counters, mostly for dashboards and debugging.
#[derive(Debug, Default, Clone, Copy)]
pub struct Stats {
    pub received: u64,
    pub relayed: u64,
    pub duplicates: u64,
    pub rejected: u64,
}

/// The gossip state machine.`,
          ],
          ["    limiter: Limiter,\n}", "    limiter: Limiter,\n    stats: Stats,\n}"],
          [
            "store: Store::new(), limiter }",
            "store: Store::new(), limiter, stats: Stats::default() }",
          ],
          [
            "    pub fn store(&self) -> &Store {",
            `    pub fn stats(&self) -> Stats {
        self.stats
    }

    pub fn store(&self) -> &Store {`,
          ],
          [
            "        if !self.limiter.allow(&from, now) {\n            return Err(Error::RateLimited(from));\n        }\n",
            `        if !self.limiter.allow(&from, now) {
            self.stats.rejected += 1;
            return Err(Error::RateLimited(from));
        }
        self.stats.received += 1;
`,
          ],
          [
            '            trace!("already have announcement from {origin}");\n',
            '            trace!("already have announcement from {origin}");\n            self.stats.duplicates += 1;\n',
          ],
          [
            `        Ok(self
            .peers
            .values()
            .filter(|p| p.connected && p.id != relayer && p.id != origin)
            .map(|p| (p.id, Message::Announce(ann.clone())))
            .collect())
`,
            `        let out: Vec<_> = self
            .peers
            .values()
            .filter(|p| p.connected && p.id != relayer && p.id != origin)
            .map(|p| (p.id, Message::Announce(ann.clone())))
            .collect();
        self.stats.relayed += out.len() as u64;

        Ok(out)
`,
          ],
        ],
      },
    },
    {
      label: "readme-contrib",
      message: `docs: add a Contributing section to the README`,
      author: "lena",
      daysAgo: 71,
      changes: {
        "README.md": [
          [
            "## License\n",
            `## Contributing

Patches welcome! beacon lives on Radicle: clone it, make a branch, and
open a patch with \`git push rad HEAD:refs/patches\`. Before pushing, run
the same checks CI runs:

\`\`\`sh
./ci/check.sh
\`\`\`

Issues labelled \`good-first-issue\` are a good place to start. If you're
planning something bigger, open an issue first so we can talk it through.
Two of the three delegates need to approve a patch before it lands.

## License
`,
          ],
        ],
      },
    },
    {
      label: "fanout-1",
      message: `gossip: relay to a random subset of peers

Relaying every announcement to every connected peer made traffic grow
with the square of the network. Pick at most Config::fanout (default 8)
peers at random instead; with the usual gossip math that still reaches
everyone in a handful of rounds.

Random rather than the first N, because HashMap iteration order is
stable within a process and we'd keep picking the same unlucky peers.`,
      author: "ada",
      daysAgo: 57,
      changes: {
        "Cargo.toml": [['log = "0.4"\n', 'log = "0.4"\nrand = "0.8"\n']],
        "src/gossip.rs": [
          ["use log::{debug, trace};\n", "use log::{debug, trace};\nuse rand::seq::IteratorRandom;\n"],
          [
            "    pub burst: u32,\n",
            "    pub burst: u32,\n    /// Relay each new announcement to at most this many peers.\n    pub fanout: usize,\n",
          ],
          ["            burst: 128,\n", "            burst: 128,\n            fanout: 8,\n"],
          [
            "        // Relay to every connected peer except the one we got it from and\n        // the origin itself.\n",
            "        // Relay to a random subset of connected peers, never back to the\n        // relayer or the origin.\n",
          ],
          [
            `        let out: Vec<_> = self
            .peers
            .values()
            .filter(|p| p.connected && p.id != relayer && p.id != origin)
            .map(|p| (p.id, Message::Announce(ann.clone())))
            .collect();
`,
            `        let candidates = self
            .peers
            .values()
            .filter(|p| p.connected && p.id != relayer && p.id != origin);
        let out: Vec<_> = candidates
            .choose_multiple(&mut rand::thread_rng(), self.config.fanout)
            .into_iter()
            .map(|p| (p.id, Message::Announce(ann.clone())))
            .collect();
`,
          ],
        ],
        "README.md": [
          [
            "4. **Relay.** Anything new is forwarded to every connected peer except the\n   one we heard it from and the original author.",
            "4. **Relay.** Anything new is forwarded to up to `Config::fanout` randomly\n   chosen connected peers, never back to the one we heard it from or the\n   original author.",
          ],
        ],
      },
    },
    {
      label: "fanout-merged",
      message: `test: relays are capped at the configured fanout`,
      author: "ada",
      daysAgo: 56,
      changes: {
        "tests/gossip.rs": [
          [
            "    assert!(beacon.store().is_empty());\n}\n",
            `    assert!(beacon.store().is_empty());
}

#[test]
fn relays_to_at_most_fanout_peers() {
    let config = Config { fanout: 3, ..Config::default() };
    let mut beacon = Beacon::new(config);
    let (_, relayer) = peer();
    beacon.connected(relayer, 0);
    for _ in 0..10 {
        beacon.connected(peer().1, 0);
    }

    let (carol_key, _) = peer();
    let out = beacon
        .received(relayer, Message::Announce(node_ann(&carol_key, 0)), 0)
        .unwrap();

    assert_eq!(out.len(), 3);
    assert!(out.iter().all(|(to, _)| *to != relayer));
}
`,
          ],
        ],
      },
    },
    {
      label: "dalek-bump",
      message: `build: require ed25519-dalek 2.1 and Rust 1.75

2.1 fixes a timing side channel in batch verification that we don't use
yet but are about to. Its MSRV is 1.75, so ours moves too.`,
      author: "kofi",
      daysAgo: 46,
      changes: {
        "Cargo.toml": [
          ['rust-version = "1.70"', 'rust-version = "1.75"'],
          ['version = "2", features', 'version = "2.1", features'],
        ],
        "ci/check.sh": [["cargo +1.70 check --lib", "cargo +1.75 check --lib"]],
      },
    },
    {
      label: "v0.3",
      message: `release: v0.3.0`,
      author: "tomas",
      daysAgo: 39,
      changes: {
        "Cargo.toml": [['version = "0.2.0"', 'version = "0.3.0"']],
        "README.md": [['beacon = "0.2"', 'beacon = "0.3"']],
        "CHANGELOG.md": [
          [
            "## Unreleased\n\n",
            `## Unreleased

## 0.3.0

- Announcements are relayed to at most \`Config::fanout\` random peers
  instead of all of them. Set it to \`usize::MAX\` for the old behaviour.
- New \`Beacon::stats()\` with received/relayed/duplicate/rejected counters.
- MSRV is now 1.75 (ed25519-dalek 2.1).

`,
          ],
        ],
      },
    },
    {
      label: "store-index",
      message: `perf(store): index announcements by timestamp

Store::since scanned and sorted every entry on each Subscribe, and prune
scanned everything on each tick. On the closet seed (~40k entries) that
was most of the CPU profile. Keep a BTreeMap from timestamp to keys
alongside the entries map; since() becomes a range query and prune()
a split_off.

Before/after on the seed's snapshot, Subscribe { since: now - 5min }:
  scan + sort   2.9 ms
  range query   0.04 ms`,
      author: "yuki",
      daysAgo: 21,
      changes: {
        "src/store.rs": STORE_INDEXED,
      },
    },
    {
      label: "readme-typo",
      message: `docs: fix typo in README quick start`,
      author: "oskar",
      daysAgo: 10,
      changes: {
        "README.md": [["told us abuot a peer", "told us about a peer"]],
      },
    },
    {
      label: "proptest",
      message: `test: property-test store ordering and pruning

The timestamp index made the store's invariants less obvious. These
check that since() is strictly-after and sorted, and that prune() only
ever removes what it reports.`,
      author: "tomas",
      daysAgo: 1,
      changes: {
        "Cargo.toml": [['env_logger = "0.11"\n', 'env_logger = "0.11"\nproptest = "1"\n']],
        "tests/store.rs": TESTS_STORE,
      },
    },
  ],

  issues: [
    {
      title: "Seed node pegged at 100% CPU after ~2 days of uptime",
      author: "oskar",
      daysAgo: 152,
      labels: ["bug", "perf"],
      assignees: ["yuki"],
      state: "solved",
      closedHoursAfter: 130,
      body: `I run beacon 0.1.0 on a small seed node (a fanless box in a closet, 4 cores, nothing else on it). After a fresh start it idles at ~2% CPU. After about two days it's at 100% on one core and stays there until I restart it.

Things I checked:

- Memory grows too, but slowly (~180 MB after 2 days).
- The store size looks fine thanks to pruning — \`beacon.store().len()\` hovers around 9k.
- Number of *connected* peers is stable at ~25.

I can attach a perf recording if that helps. Happy to run a debug build too.`,
      comments: [
        {
          author: "tomas",
          hoursAfter: 3,
          body: `Thanks for the report! A flame graph would be great — \`cargo flamegraph --bin <yours>\` for a minute or so while it's hot.

My first guess is \`peers\` rather than \`store\`: we prune announcements but I don't think anything ever removes a peer.`,
        },
        {
          author: "oskar",
          hoursAfter: 20,
          body: `Here's the hot path from the flame graph, trimmed:

\`\`\`text
beacon::gossip::Beacon::announced   91.2%
  <Filter<Values<PeerId, PeerInfo>> as Iterator>::next   88.7%
\`\`\`

And \`beacon.peers().count()\` is **214,331**. So yes, it's the peers table.`,
          reactions: [{ emoji: "👀", by: ["ada", "yuki"] }],
        },
        {
          author: "ada",
          hoursAfter: 22,
          replyTo: 1,
          body: "214k peers on a network that has maybe 400 real nodes. Somebody out there is generating fresh keys in a loop. Either way, we need to forget peers.",
        },
        {
          author: "yuki",
          hoursAfter: 26,
          body: "I'll take this. Plan: a `peer_timeout` in `Config`, and `tick()` drops disconnected peers we haven't heard about for that long. The relay loop only looks at connected peers anyway, but iterating 200k entries to find 25 is silly.",
          reactions: [{ emoji: "👍", by: ["tomas", "oskar", "self"] }],
        },
        {
          author: "self",
          hoursAfter: 30,
          replyTo: 3,
          body: "Sounds right. Longer term we might want to keep connected peers in their own set so relay is O(connected) regardless, but the timeout fixes the actual bug.",
        },
        {
          author: "oskar",
          hoursAfter: 128,
          body: "Running the fix for three days now. Flat at 2–3% CPU, ~1.1k peers in the table. Thank you all!",
          reactions: [{ emoji: "🎉", by: ["yuki", "ada", "tomas", "self"] }],
        },
      ],
    },
    {
      title: "Fixed-window limiter allows 2x burst at window edges",
      author: "yuki",
      daysAgo: 130,
      labels: ["bug", "enhancement"],
      assignees: ["yuki"],
      state: "solved",
      closedHoursAfter: 200,
      body: `With \`rate_limit: 64, rate_window: 1000\`, a peer can send 64 messages at t=999ms and another 64 at t=1000ms. That's 128 messages in 2ms, which is exactly the kind of burst the limiter is meant to stop.

Repro:

\`\`\`rust
let mut l = Limiter::new(64, 1000);
let p = some_peer();
assert!((0..64).all(|_| l.allow(&p, 999)));
assert!((0..64).all(|_| l.allow(&p, 1000))); // passes, shouldn't
\`\`\`

I'd like to replace it with a token bucket. It's about the same amount of code and doesn't have edges.`,
      comments: [
        {
          author: "ada",
          hoursAfter: 5,
          body: "Agreed, token bucket. Can we also make sure idle buckets get cleaned up? The current `counters` map has the same unbounded-growth problem the peers table had.",
          reactions: [{ emoji: "👍", by: ["yuki"] }],
        },
        {
          author: "yuki",
          hoursAfter: 7,
          replyTo: 0,
          body: "Yes — a bucket that has fully refilled is indistinguishable from a new one, so `tick()` can just drop those.",
        },
      ],
    },
    {
      title: "Document the wire format",
      author: "lena",
      daysAgo: 102,
      labels: ["docs", "good-first-issue"],
      state: "open",
      body: `\`beacon::wire\` is now the recommended way to put messages on a socket, but the only description of the format is the code. People writing implementations in other languages will need a proper description.

Suggested contents for a \`docs/wire.md\`:

- frame layout (length prefix, tag, body)
- the tag table
- the payload encoding, and the fact that it's *also* the signed bytes
- limits (string lengths are a single byte, inventories at most 65535 items)
- a worked hex dump of one Ping and one Node announcement

This is a nice first issue if you like reading code more than writing it.`,
      comments: [
        {
          author: "oskar",
          hoursAfter: 30,
          body: "I'd like to try this! I'm half-way through a Python decoder for my monitoring scripts anyway, so I've been staring at these bytes for a week.",
          reactions: [{ emoji: "❤️", by: ["lena", "kofi"] }],
        },
        {
          author: "lena",
          hoursAfter: 33,
          replyTo: 0,
          body: "Wonderful, it's yours. Don't worry about polish on the first patch; I'm happy to do a pass on the prose.",
        },
        {
          author: "self",
          hoursAfter: 900,
          body: "@oskar any progress? No pressure — if you've got a draft, even a rough one, feel free to open it as a draft patch so others can help.",
        },
        {
          author: "oskar",
          hoursAfter: 910,
          replyTo: 2,
          body: "Life happened 😅 I have about half of it written. Will push a draft this week.",
        },
      ],
    },
    {
      title: "Is beacon usable from async code (tokio)?",
      author: "kofi",
      daysAgo: 92,
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 26,
      body: "Our node is all tokio. Is there an async API planned, or should we wrap `Beacon` in a `Mutex`? Asking before I write glue code that you're about to make obsolete.",
      comments: [
        {
          author: "tomas",
          hoursAfter: 4,
          body: `No async API planned, on purpose — beacon doesn't do I/O, so there's nothing to await. The pattern we use:

\`\`\`rust
// One task owns the Beacon. Everything else talks to it over a channel.
while let Some(event) = rx.recv().await {
    let out = match event {
        Event::Received(from, msg) => beacon.received(from, msg, now())?,
        Event::Tick => { beacon.tick(now()); vec![] }
    };
    for (to, msg) in out {
        senders[&to].send(wire::encode(&msg)).await?;
    }
}
\`\`\`

No mutex needed, and the state machine stays trivially testable.`,
          reactions: [{ emoji: "👍", by: ["kofi", "ada"] }],
        },
        {
          author: "kofi",
          hoursAfter: 25,
          body: "That's cleaner than what I had in mind. Closing — maybe this snippet belongs in the README though?",
        },
      ],
    },
    {
      title: "Could beacon work for buoy discovery over LoRa?",
      author: "sol",
      daysAgo: 64,
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 140,
      body: `Hi from the Tidal Collective! We have ~30 sensor buoys that need to find the nearest shore gateway. Right now that's a hard-coded list and it's painful every time a gateway moves.

beacon's model (signed "I'm here" announcements, gossip, no central server) is very close to what we want. The catch is the link: LoRa gives us ~220-byte frames and a duty cycle of 1%.

Is that a terrible idea?`,
      comments: [
        {
          author: "ada",
          hoursAfter: 6,
          body: `Not terrible! Back-of-envelope for a Node announcement over \`beacon::wire\`:

| part | bytes |
|---|---|
| length + tag | 5 |
| key | 32 |
| timestamp | 8 |
| signature | 64 |
| payload (1 short addr, no alias) | ~20 |

So ~130 bytes, fits in one frame. Inventory announcements would need to stay small.`,
          reactions: [{ emoji: "❤️", by: ["sol"] }],
        },
        {
          author: "yuki",
          hoursAfter: 9,
          body: "The duty cycle is the real constraint. You'd want `fanout: 1` or `2` and a large `max_age` so you're not re-announcing all the time.",
        },
        {
          author: "sol",
          hoursAfter: 120,
          body: "We tried it on two buoys in the harbour this week with fanout 1 and max_age 6h. It works! Closing this as answered — we'll write up how it goes.",
          reactions: [
            { emoji: "🎉", by: ["ada", "yuki", "tomas", "self"] },
            { emoji: "❤️", by: ["oskar"] },
          ],
        },
      ],
    },
    {
      title: "PeerId's Display is too short to grep logs reliably",
      author: "mira",
      daysAgo: 42,
      labels: ["enhancement", "good-first-issue"],
      state: "open",
      body: `\`PeerId\` displays as the first 6 bytes in hex (12 chars). When I grep a day of logs from a busy node for a peer I get matches from at least two different keys.

Could we either:

1. bump it to 8 bytes, or
2. add \`{:#}\` for the full key and keep the short form for humans?

I'd lean towards 2.`,
      comments: [
        {
          author: "tomas",
          hoursAfter: 12,
          body: "+1 for option 2. Alternate formatting for the full key is exactly what `#` is for.",
          reactions: [{ emoji: "👍", by: ["mira", "lena"] }],
        },
      ],
    },
    {
      title: "Paginate Subscribe replies",
      author: "tomas",
      daysAgo: 17,
      labels: ["enhancement", "perf"],
      assignees: ["ada"],
      state: "open",
      body: `\`Subscribe { since: 0 }\` replays the whole store in one go. On a big node that's tens of thousands of messages queued for one peer at once, which:

- blows straight through the peer's token bucket on the other side, so most of them get dropped, and
- spikes our own memory while the reply is being built.

Proposal: add a \`limit\` to \`Subscribe\`, and have the reply end with a cursor the subscriber can continue from. Now that the store is indexed by timestamp (see the store-index commit) this is cheap to implement.`,
      comments: [
        {
          author: "ada",
          hoursAfter: 8,
          body: "Agreed. Wire format change though, so it should land before 0.4 and go in the changelog as breaking. I can pick it up after peer exchange.",
        },
        {
          author: "self",
          hoursAfter: 11,
          body: "Should the cursor be a timestamp or `(timestamp, key)`? With only a timestamp, two announcements with the same ms can straddle a page boundary and one gets skipped.",
          reactions: [{ emoji: "👀", by: ["tomas"] }],
        },
        {
          author: "tomas",
          hoursAfter: 14,
          replyTo: 1,
          body: "Good catch. `(timestamp, key)` then — keys are already ordered in the index.",
        },
      ],
    },
    {
      title: "Announcements rejected as FromFuture from a peer with a drifting clock",
      author: "oskar",
      daysAgo: 8,
      labels: ["bug", "question"],
      state: "open",
      body: `One of the nodes I peer with has a clock that's ~45s fast (Raspberry Pi without an RTC, NTP not set up). All its announcements get rejected:

\`\`\`text
WARN beacon: rejected announcement: announcement timestamp 1793112045123 is in the future
\`\`\`

Obviously the real fix is "set up NTP", but should one misconfigured node be invisible to everyone? 30s of \`max_drift\` feels tight for hobby hardware.`,
      comments: [
        {
          author: "ada",
          hoursAfter: 5,
          body: "The reason for the limit is that a far-future announcement can't be superseded until real time catches up. 30s was a guess. I'd be fine with 2 minutes as a default.",
        },
        {
          author: "tomas",
          hoursAfter: 9,
          body: "Alternative: accept it but clamp the timestamp we *store* to `now + max_drift`. Then it's visible, and still supersedable soon. Signature covers the original timestamp though, so we couldn't relay the clamped version.",
        },
        {
          author: "ada",
          hoursAfter: 11,
          replyTo: 1,
          body: "Yeah, clamping breaks relay. Let's just raise the default and log the drift so operators notice.",
          reactions: [{ emoji: "👍", by: ["oskar", "tomas"] }],
        },
      ],
    },
    {
      title: "Add a way to forget a peer (e.g. after banning it)",
      author: "self",
      daysAgo: 26,
      labels: ["enhancement"],
      assignees: ["self"],
      state: "open",
      body: `When our node bans a peer for misbehaving, there's no way to make beacon forget about it. Its announcements stay in the store and keep getting served to subscribers until they age out, and its rate-limit bucket sticks around.

I'd like something like:

\`\`\`rust
/// Drop a peer, everything it announced, and its limiter state.
pub fn forget(&mut self, peer: &PeerId) -> usize
\`\`\`

returning how many announcements were removed. I'll write the patch.`,
      comments: [
        {
          author: "yuki",
          hoursAfter: 6,
          body: "With the timestamp index this needs a reverse lookup or a scan over `entries`. A scan is fine for something that happens on ban, IMO.",
          reactions: [{ emoji: "👍", by: ["self"] }],
        },
      ],
    },
    {
      title: "Make fanout adaptive",
      author: "yuki",
      daysAgo: 3,
      labels: ["enhancement", "perf"],
      state: "open",
      body: `A fixed \`fanout: 8\` is too much for a node with 10 peers and arguably too little for one with 500. Most gossip literature uses something like \`ln(n) + c\`.

Proposal: \`Fanout::Fixed(usize)\` vs \`Fanout::Log { extra: usize }\`, default \`Log { extra: 2 }\`. Happy to simulate convergence for both before we decide.`,
      comments: [
        {
          author: "self",
          hoursAfter: 4,
          body: "Simulations would be great. Could you include a lossy-link case? Sol's LoRa buoys are a real user now and run with fanout 1.",
        },
      ],
    },
  ],

  patches: [
    // Merged
    {
      title: "Replace the fixed-window limiter with a token bucket",
      author: "yuki",
      daysAgo: 123,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description: `Fixes the 2x burst at window edges.

- \`Limiter\` is now a per-peer token bucket (\`rate\` tokens/s, \`burst\` max).
- Full buckets are swept on \`tick()\`, so idle peers cost nothing.
- \`Config::rate_limit\`/\`rate_window\` become \`Config::rate\`/\`burst\`. This is a breaking change; I'd like it in 0.2.`,
          hoursAfter: 0,
          fromHistory: ["token-bucket", "rate-limit-merged"],
          reviews: [
            {
              author: "ada",
              hoursAfter: 10,
              verdict: "accept",
              summary: "Lovely. The sweep is a nice touch. One question inline, not blocking.",
              comments: [
                {
                  path: "src/limiter.rs",
                  line: 39,
                  body: "`as f64 / 1000.0` loses precision after ~285k years of uptime. I think we'll be fine.",
                  resolved: true,
                },
              ],
            },
            {
              author: "tomas",
              hoursAfter: 22,
              verdict: "accept",
              summary: "Checked the defaults against a Subscribe replay from my node: peaks at ~110 messages, so 128 burst is right.",
            },
          ],
          comments: [
            {
              author: "yuki",
              hoursAfter: 24,
              body: "Thanks both! Merging.",
              reactions: [{ emoji: "🎉", by: ["ada", "tomas"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Add beacon::wire, a binary encoding for messages",
      author: "kofi",
      daysAgo: 111,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description: `Every user of beacon has written their own framing, and at least two got the signed bytes wrong. This adds a small, length-prefixed format.

Format: \`u32\` BE length, \`u8\` tag, body. Announcement payloads reuse \`Payload::encode\`, so what's on the wire is exactly what was signed.

The second commit caps preallocation on decode after tomas found that a hostile inventory length makes us allocate ~2 MiB up front.`,
          hoursAfter: 0,
          fromHistory: ["wire-codec", "wire-bounds"],
          reviews: [
            {
              author: "tomas",
              hoursAfter: 30,
              verdict: "accept",
              summary: "With the preallocation fix this looks good. The hostile-length test is exactly what I wanted.",
              comments: [
                {
                  path: "src/wire.rs",
                  line: 93,
                  body: "This one was the problem — thanks for capping it.",
                  resolved: true,
                },
              ],
            },
            {
              author: "self",
              hoursAfter: 40,
              verdict: "accept",
              summary: "LGTM. We should write the format down somewhere other than the code; I'll open an issue.",
            },
          ],
        },
      ],
    },
    {
      title: "Relay to a random subset of peers (fanout)",
      author: "ada",
      daysAgo: 59,
      labels: ["enhancement", "perf"],
      state: "merged",
      revisions: [
        {
          description: `Relaying to every connected peer makes traffic grow quadratically with the network. This adds \`Config::fanout\` (default 8) and relays each new announcement to at most that many peers.`,
          hoursAfter: 0,
          base: "readme-contrib",
          commits: [
            {
              message: `gossip: relay to at most Config::fanout peers`,
              author: "ada",
              daysAgo: 59,
              changes: {
                "src/gossip.rs": [
                  [
                    "    pub burst: u32,\n",
                    "    pub burst: u32,\n    /// Relay each new announcement to at most this many peers.\n    pub fanout: usize,\n",
                  ],
                  ["            burst: 128,\n", "            burst: 128,\n            fanout: 8,\n"],
                  [
                    "            .map(|p| (p.id, Message::Announce(ann.clone())))\n            .collect();\n",
                    "            .take(self.config.fanout)\n            .map(|p| (p.id, Message::Announce(ann.clone())))\n            .collect();\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "tomas",
              hoursAfter: 20,
              summary: "Right idea, but `take()` isn't random.",
              comments: [
                {
                  path: "src/gossip.rs",
                  line: 162,
                  body: `\`HashMap\` iteration order is fixed for the lifetime of the process, so this always picks the *same* 8 peers. If any of them is slow or malicious, announcements just stop propagating through this node.

Could we use \`choose_multiple\` from \`rand::seq::IteratorRandom\`? It's a reservoir sample, so still one pass.`,
                },
              ],
            },
          ],
        },
        {
          description: `Picks peers at random with \`IteratorRandom::choose_multiple\`, adds a test, and updates the README.`,
          hoursAfter: 52,
          fromHistory: ["fanout-1", "fanout-merged"],
          reviews: [
            {
              author: "tomas",
              hoursAfter: 60,
              verdict: "accept",
              summary: "Perfect, thanks.",
            },
            {
              author: "self",
              hoursAfter: 64,
              verdict: "accept",
              summary: "Nice. Worth calling out in the changelog that `usize::MAX` restores the old behaviour.",
            },
          ],
        },
      ],
    },

    // Open, several revisions, reviews with code comments
    {
      title: "Peer exchange: GetPeers / Peers messages",
      author: "ada",
      daysAgo: 13,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description: `New nodes currently only learn about peers that happen to announce while they're connected. This adds a simple peer exchange:

- \`Message::GetPeers\` asks a neighbour for the addresses it knows.
- \`Message::Peers\` is the reply.
- Both are supported in \`beacon::wire\` (tags 0x05 and 0x06).

Addresses in a \`Peers\` reply are **not** signed; they're hints.`,
          hoursAfter: 0,
          base: "store-index",
          commits: [
            {
              message: `gossip: add GetPeers/Peers peer exchange

Lets a freshly started node bootstrap its peers table from a single
neighbour instead of waiting for announcements to trickle in.`,
              author: "ada",
              daysAgo: 13,
              changes: {
                "src/message.rs": [
                  [
                    "    Ping { nonce: u64 },\n",
                    `    /// Ask a peer for the addresses of peers it knows.
    GetPeers,
    /// Reply to \`GetPeers\`. Addresses are unsigned hints.
    Peers { peers: Vec<(PeerId, Vec<String>)> },
    Ping { nonce: u64 },
`,
                  ],
                ],
                "src/gossip.rs": [
                  [
                    "            Message::Ping { nonce } => Ok(vec![(from, Message::Pong { nonce })]),\n",
                    `            Message::GetPeers => {
                let peers = self
                    .peers
                    .values()
                    .filter(|p| p.id != from)
                    .map(|p| (p.id, p.addrs.clone()))
                    .collect();
                Ok(vec![(from, Message::Peers { peers })])
            }
            Message::Peers { peers } => {
                for (id, addrs) in peers {
                    let info = self.peers.entry(id).or_insert_with(|| PeerInfo::new(id, now));
                    info.addrs = addrs;
                }
                Ok(vec![])
            }
            Message::Ping { nonce } => Ok(vec![(from, Message::Pong { nonce })]),
`,
                  ],
                ],
                "src/wire.rs": [
                  [
                    "const TAG_PONG: u8 = 0x04;\n",
                    "const TAG_PONG: u8 = 0x04;\nconst TAG_GET_PEERS: u8 = 0x05;\nconst TAG_PEERS: u8 = 0x06;\n",
                  ],
                  [
                    "        Message::Ping { nonce } => {\n            body.push(TAG_PING);\n",
                    `        Message::GetPeers => body.push(TAG_GET_PEERS),
        Message::Peers { peers } => {
            body.push(TAG_PEERS);
            body.push(peers.len() as u8);
            for (id, addrs) in peers {
                body.extend_from_slice(id.as_bytes());
                body.push(addrs.len() as u8);
                for addr in addrs {
                    body.push(addr.len() as u8);
                    body.extend_from_slice(addr.as_bytes());
                }
            }
        }
        Message::Ping { nonce } => {
            body.push(TAG_PING);
`,
                  ],
                  [
                    "        TAG_PING => Ok(",
                    `        TAG_GET_PEERS => Ok(Message::GetPeers),
        TAG_PEERS => {
            let n = take::<1>(&mut buf)?[0];
            let mut peers = Vec::with_capacity(n as usize);
            for _ in 0..n {
                let id = PeerId::try_from(take::<32>(&mut buf)?).map_err(|_| DecodeError::InvalidKey)?;
                let count = take::<1>(&mut buf)?[0];
                let mut addrs = Vec::new();
                for _ in 0..count {
                    addrs.push(string(&mut buf)?);
                }
                peers.push((id, addrs));
            }
            Ok(Message::Peers { peers })
        }
        TAG_PING => Ok(`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "tomas",
              hoursAfter: 18,
              summary:
                "Really want this, but two things worry me: unsigned addresses overwriting signed ones, and unbounded replies.",
              comments: [
                {
                  path: "src/gossip.rs",
                  line: 133,
                  endLine: 136,
                  body: `This lets any neighbour overwrite the addresses of a peer we learned about from a *signed* \`Node\` announcement. One malicious node could redirect everyone's connections for a given key.

Suggestion: only insert peers we don't know at all, and never touch existing entries.`,
                },
                {
                  path: "src/gossip.rs",
                  line: 127,
                  body: "This includes peers with no known addresses (anyone we only heard of via `Inventory`), and has no cap. Filter out empty `addrs` and limit the reply size?",
                },
                {
                  path: "src/wire.rs",
                  line: 53,
                  body: "`peers.len() as u8` silently truncates past 255 entries while the loop below still writes all of them — the decoder will then misread the rest of the frame.",
                },
              ],
            },
            {
              author: "yuki",
              hoursAfter: 20,
              summary: "+1 to tomas. Also: should GetPeers be rate-limited separately? It's a much bigger reply than a Ping.",
            },
          ],
          comments: [
            {
              author: "ada",
              hoursAfter: 21,
              body: "All fair. The overwrite one is embarrassing — I'll fix both. On a separate limit: let's see whether the reply cap is enough first.",
              reactions: [{ emoji: "👍", by: ["tomas", "yuki"] }],
            },
          ],
        },
        {
          description: `Addressed review:

- \`Peers\` replies only add peers we don't know yet; signed addresses always win.
- Replies skip peers without addresses and are capped at \`MAX_PEERS_REPLY\` (64), on both the sending and the receiving side.
- The encoder truncates to the cap, so the count byte can't overflow.`,
          hoursAfter: 40,
          commits: [
            {
              message: `gossip: don't let Peers replies override signed addresses

Also caps replies at MAX_PEERS_REPLY and skips peers without addresses.`,
              author: "ada",
              daysAgo: 11,
              changes: {
                "src/message.rs": [
                  [
                    "pub const MAX_PAYLOAD_SIZE: usize = 4096;\n",
                    `pub const MAX_PAYLOAD_SIZE: usize = 4096;

/// Most peers we'll send or accept in a single \`Peers\` reply.
pub const MAX_PEERS_REPLY: usize = 64;
`,
                  ],
                ],
                "src/gossip.rs": [
                  [
                    "use crate::message::{Announcement, Message, Payload};",
                    "use crate::message::{Announcement, Message, Payload, MAX_PEERS_REPLY};",
                  ],
                  [
                    "                    .filter(|p| p.id != from)\n",
                    "                    .filter(|p| p.id != from && !p.addrs.is_empty())\n                    .take(MAX_PEERS_REPLY)\n",
                  ],
                  [
                    `                for (id, addrs) in peers {
                    let info = self.peers.entry(id).or_insert_with(|| PeerInfo::new(id, now));
                    info.addrs = addrs;
                }
`,
                    `                // Addresses in a Peers reply are unsigned hints: only use
                // them for peers we know nothing about yet. A signed Node
                // announcement always wins.
                for (id, addrs) in peers.into_iter().take(MAX_PEERS_REPLY) {
                    self.peers
                        .entry(id)
                        .or_insert_with(|| PeerInfo { addrs, ..PeerInfo::new(id, now) });
                }
`,
                  ],
                ],
                "src/wire.rs": [
                  [
                    "use crate::message::{Announcement, Message, Payload};",
                    "use crate::message::{Announcement, Message, Payload, MAX_PEERS_REPLY};",
                  ],
                  [
                    "            body.push(peers.len() as u8);\n",
                    "            let peers = &peers[..peers.len().min(MAX_PEERS_REPLY)];\n            body.push(peers.len() as u8);\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "tomas",
              hoursAfter: 52,
              verdict: "accept",
              summary: "Both concerns addressed. Would like a test for the override case but won't block on it.",
              comments: [
                {
                  path: "src/gossip.rs",
                  line: 137,
                  endLine: 141,
                  body: "This is exactly what I had in mind. 👍",
                  resolved: true,
                },
              ],
            },
            {
              author: "yuki",
              hoursAfter: 60,
              summary: "Looks good. Nit: the comment says 'Peers reply' but the variant is `Message::Peers` — fine either way.",
            },
          ],
        },
        {
          description: `Adds an integration test that a \`Peers\` reply can't override addresses from a signed announcement.`,
          hoursAfter: 100,
          commits: [
            {
              message: `test: Peers replies don't override signed addresses`,
              author: "ada",
              daysAgo: 9,
              changes: {
                "tests/gossip.rs": [
                  [
                    "    assert!(out.iter().all(|(to, _)| *to != relayer));\n}\n",
                    `    assert!(out.iter().all(|(to, _)| *to != relayer));
}

#[test]
fn peers_reply_does_not_override_signed_addresses() {
    let mut beacon = Beacon::new(Config::default());
    let (_, alice) = peer();
    let (carol_key, carol) = peer();

    beacon.connected(alice, 0);
    beacon.received(alice, Message::Announce(node_ann(&carol_key, 0)), 0).unwrap();

    let bogus = Message::Peers { peers: vec![(carol, vec!["203.0.113.66:1".into()])] };
    beacon.received(alice, bogus, 1).unwrap();

    let info = beacon.peers().find(|p| p.id == carol).unwrap();
    assert_eq!(info.addrs, vec!["10.0.0.1:8776".to_owned()]);
}
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "self",
              hoursAfter: 110,
              verdict: "accept",
              summary: "Thanks for the test. Happy with this; one more delegate approval and it's in.",
            },
          ],
          comments: [
            {
              author: "tomas",
              hoursAfter: 115,
              body: "Re-accepting once I've run it against the closet seed's snapshot over the weekend.",
            },
          ],
        },
      ],
    },

    // Open, authored by self, awaiting review
    {
      title: "Add Beacon::forget to drop a peer and its announcements",
      author: "self",
      daysAgo: 2,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description: `Closes the "forget a peer" issue.

\`Beacon::forget(&peer)\` removes the peer from the peers table, drops its limiter bucket and removes every announcement it authored from the store. Returns the number of announcements removed.

\`Store::remove_peer\` scans \`entries\` rather than keeping a reverse index — this only happens on ban, so I didn't think the extra bookkeeping was worth it.`,
          hoursAfter: 0,
          base: "readme-typo",
          commits: [
            {
              message: `gossip: add Beacon::forget

Drops a peer, its rate limiter state and everything it announced. Meant
to be called after banning a misbehaving peer.`,
              author: "self",
              daysAgo: 2,
              changes: {
                "src/store.rs": [
                  [
                    "    fn unindex(&mut self, ts: Timestamp, key: &Key) {",
                    `    /// Drop everything \`peer\` announced. Returns how many entries were removed.
    pub fn remove_peer(&mut self, peer: &PeerId) -> usize {
        let keys: Vec<Key> = self.entries.keys().filter(|(p, _)| p == peer).copied().collect();
        for key in &keys {
            if let Some(ann) = self.entries.remove(key) {
                self.unindex(ann.timestamp, key);
            }
        }
        keys.len()
    }

    fn unindex(&mut self, ts: Timestamp, key: &Key) {`,
                  ],
                ],
                "src/limiter.rs": [
                  [
                    "    /// Forget peers whose buckets are full again;",
                    `    /// Drop the bucket for \`peer\`.
    pub fn forget(&mut self, peer: &PeerId) {
        self.buckets.remove(peer);
    }

    /// Forget peers whose buckets are full again;`,
                  ],
                ],
                "src/gossip.rs": [
                  [
                    "    pub fn disconnected(&mut self, peer: &PeerId) {",
                    `    /// Forget a peer entirely: its info, its announcements and its rate
    /// limiter bucket. Returns how many announcements were removed.
    pub fn forget(&mut self, peer: &PeerId) -> usize {
        self.peers.remove(peer);
        self.limiter.forget(peer);
        self.store.remove_peer(peer)
    }

    pub fn disconnected(&mut self, peer: &PeerId) {`,
                  ],
                ],
                "tests/gossip.rs": [
                  [
                    "    assert!(out.iter().all(|(to, _)| *to != relayer));\n}\n",
                    `    assert!(out.iter().all(|(to, _)| *to != relayer));
}

#[test]
fn forget_drops_peer_and_announcements() {
    let mut beacon = Beacon::new(Config::default());
    let (_, alice) = peer();
    let (carol_key, carol) = peer();

    beacon.connected(alice, 0);
    beacon.received(alice, Message::Announce(node_ann(&carol_key, 0)), 0).unwrap();
    assert_eq!(beacon.store().len(), 1);

    assert_eq!(beacon.forget(&carol), 1);
    assert!(beacon.store().is_empty());
    assert!(beacon.peers().all(|p| p.id != carol));
}
`,
                  ],
                ],
                "CHANGELOG.md": [
                  [
                    "## Unreleased\n\n",
                    "## Unreleased\n\n- New `Beacon::forget` drops a peer, its limiter bucket and its announcements.\n\n",
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "tomas",
              hoursAfter: 6,
              body: "Thanks! I'm travelling until Thursday; will review properly then unless ada beats me to it.",
            },
          ],
        },
      ],
    },

    // Open, rejected then fixed
    {
      title: "store: optional capacity limit",
      author: "tomas",
      daysAgo: 31,
      labels: ["enhancement", "perf"],
      state: "open",
      revisions: [
        {
          description: `Adds \`Store::with_capacity(n)\`. When the store is full, inserting evicts the oldest announcement. \`Store::new()\` stays unbounded.

Motivation: the 214k-peer incident showed that someone out there is happy to generate keys in a loop. Peer timeouts bound the peers table, but the store could still be filled within one \`max_age\` window.`,
          hoursAfter: 0,
          base: "v0.3",
          commits: [
            {
              message: `store: add an optional capacity with oldest-first eviction`,
              author: "tomas",
              daysAgo: 31,
              changes: {
                "src/store.rs": [
                  [
                    "    entries: HashMap<(PeerId, u8), Announcement>,\n}",
                    "    entries: HashMap<(PeerId, u8), Announcement>,\n    capacity: Option<usize>,\n}",
                  ],
                  [
                    "    pub fn new() -> Self {\n        Self::default()\n    }\n",
                    `    pub fn new() -> Self {
        Self::default()
    }

    /// A store holding at most \`capacity\` announcements. When full, the
    /// oldest announcement is evicted to make room.
    pub fn with_capacity(capacity: usize) -> Self {
        Self { entries: HashMap::with_capacity(capacity), capacity: Some(capacity) }
    }
`,
                  ],
                  [
                    "        let key = (ann.from, kind(&ann));\n",
                    `        let key = (ann.from, kind(&ann));
        if let Some(cap) = self.capacity {
            if self.entries.len() >= cap {
                self.evict_oldest();
            }
        }
`,
                  ],
                  [
                    "    pub fn len(&self) -> usize {",
                    `    fn evict_oldest(&mut self) {
        if let Some(key) = self
            .entries
            .iter()
            .min_by_key(|(_, a)| a.timestamp)
            .map(|(k, _)| *k)
        {
            self.entries.remove(&key);
        }
    }

    pub fn len(&self) -> usize {`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "ada",
              hoursAfter: 9,
              verdict: "reject",
              summary: `Eviction happens before we know whether the insert will succeed, so this can make things strictly worse:

1. a duplicate or older announcement (which we then reject) still evicts someone, and
2. replacing an existing key evicts even though the store doesn't grow.

So once full, every duplicate that arrives via gossip — i.e. most traffic — evicts a valid entry.`,
              comments: [
                {
                  path: "src/store.rs",
                  line: 29,
                  endLine: 33,
                  body: "This needs to move below the duplicate check, and only run when the key is new.",
                },
              ],
            },
            {
              author: "yuki",
              hoursAfter: 12,
              summary: "Agree with ada. Would also love a unit test pinning the replace-doesn't-evict behaviour.",
            },
          ],
          comments: [
            {
              author: "tomas",
              hoursAfter: 13,
              body: "Oof, yes. That's what I get for writing this on a train. New revision coming.",
              reactions: [{ emoji: "😅", by: ["ada"] }],
            },
          ],
        },
        {
          description: `Only evicts when inserting a *new* key into a full store; duplicates and replacements never evict. Adds a test for the replacement case.

Note: this is still against the pre-index store. I'll rebase onto the timestamp index once we agree on the semantics — eviction gets much cheaper there (pop the first \`by_time\` entry).`,
          hoursAfter: 30,
          commits: [
            {
              message: `store: only evict when inserting a new key

Duplicates, stale announcements and replacements of an existing key no
longer evict anything.`,
              author: "tomas",
              daysAgo: 30,
              changes: {
                "src/store.rs": [
                  [
                    `        if let Some(cap) = self.capacity {
            if self.entries.len() >= cap {
                self.evict_oldest();
            }
        }
        match self.entries.get(&key) {
            Some(existing) if existing.timestamp >= ann.timestamp => false,
            _ => {
`,
                    `        match self.entries.get(&key) {
            Some(existing) if existing.timestamp >= ann.timestamp => false,
            Some(_) => {
                // Replacing an entry never grows the store.
                self.entries.insert(key, ann);
                true
            }
            None => {
                if self.capacity.is_some_and(|cap| self.entries.len() >= cap) {
                    self.evict_oldest();
                }
`,
                  ],
                  [
                    "        crate::Payload::Inventory { .. } => 2,\n    }\n}\n",
                    `        crate::Payload::Inventory { .. } => 2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Payload;
    use ed25519_dalek::SigningKey;

    fn ann(seed: u8, ts: Timestamp) -> Announcement {
        let key = SigningKey::from_bytes(&[seed; 32]);
        Announcement::new(&key, ts, Payload::Inventory { items: vec![] })
    }

    #[test]
    fn replacing_does_not_evict() {
        let mut store = Store::with_capacity(2);
        assert!(store.insert(ann(1, 10)));
        assert!(store.insert(ann(2, 20)));
        assert!(store.insert(ann(1, 30)));
        assert!(!store.insert(ann(2, 5)));

        assert_eq!(store.len(), 2);
        assert_eq!(store.since(0).len(), 2);
    }
}
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "ada",
              hoursAfter: 40,
              verdict: "accept",
              summary: "Semantics look right now. Happy for this to go in after the rebase onto the index.",
            },
            {
              author: "yuki",
              hoursAfter: 44,
              verdict: "accept",
              summary: "Thanks for the test!",
              comments: [
                {
                  path: "src/store.rs",
                  line: 37,
                  body: "`is_some_and` needs Rust 1.70 — fine now that MSRV is 1.75.",
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },

    // Draft
    {
      title: "WIP: examples: gossip over plain UDP",
      author: "yuki",
      daysAgo: 6,
      labels: ["docs"],
      state: "draft",
      revisions: [
        {
          description: `A runnable example of two beacons talking over UDP on localhost, using \`beacon::wire\` for framing. Meant to answer "but how do I actually hook this up to a socket?".

Not ready:

- [ ] We don't know the remote's key until it announces, so everything is attributed to a placeholder \`PeerId\`.
- [ ] Frames larger than one datagram are dropped.
- [ ] Should probably send a \`Subscribe\` on startup.`,
          hoursAfter: 0,
          base: "store-index",
          commits: [
            {
              message: `examples: add a UDP example (WIP)`,
              author: "yuki",
              daysAgo: 6,
              changes: {
                "examples/udp.rs": EXAMPLE_UDP,
              },
            },
          ],
          comments: [
            {
              author: "oskar",
              hoursAfter: 20,
              body: "Ran it between my laptop and the closet seed, works! For the placeholder-key problem, maybe a tiny handshake where each side sends its Node announcement first?",
              reactions: [{ emoji: "👀", by: ["yuki"] }],
            },
            {
              author: "yuki",
              hoursAfter: 26,
              replyTo: 0,
              body: "Yeah, that's the plan. I'd rather not invent a handshake in an *example* though — might be time for a tiny `beacon::session` module.",
            },
          ],
        },
      ],
    },

    // Archived
    {
      title: "Optional serde support for message types",
      author: "oskar",
      daysAgo: 116,
      labels: ["enhancement"],
      state: "archived",
      revisions: [
        {
          description: `Adds a \`serde\` feature that derives \`Serialize\`/\`Deserialize\` for \`Payload\`. I'm feeding announcements into a JSON monitoring dashboard and this would save me a lot of glue.

If this looks OK I'll extend it to \`Announcement\` and \`Message\` (needs a custom impl for the signature).`,
          hoursAfter: 0,
          base: "rate-limit-merged",
          commits: [
            {
              message: `Add optional serde derives behind a feature flag`,
              author: "oskar",
              daysAgo: 116,
              changes: {
                "Cargo.toml": [
                  [
                    "[dev-dependencies]\n",
                    'serde = { version = "1", features = ["derive"], optional = true }\n\n[dev-dependencies]\n',
                  ],
                ],
                "src/message.rs": [
                  [
                    "#[derive(Debug, Clone, PartialEq, Eq)]\npub enum Payload {",
                    '#[derive(Debug, Clone, PartialEq, Eq)]\n#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]\npub enum Payload {',
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "ada",
              hoursAfter: 14,
              body: `Thanks for this, Oskar! Timing is awkward though: kofi is about to land \`beacon::wire\`, and we'd like that to be *the* serialization story for now. Deriving serde on the message types would freeze their shape into a second format we'd have to keep compatible.

For your dashboard, would a \`Display\`-style summary or a small \`to_json()\` in your own crate work? Happy to help write it.`,
            },
            {
              author: "oskar",
              hoursAfter: 30,
              replyTo: 0,
              body: "Makes total sense, I'll do it on my side. Archiving this.",
              reactions: [{ emoji: "❤️", by: ["ada", "kofi"] }],
            },
          ],
        },
      ],
    },
  ],

  releases: [
    {
      tag: "v0.1.0",
      at: "v0.1",
      title: "beacon 0.1.0",
      author: "ada",
      daysAgo: 161,
      notes: `The first tagged release of beacon.

### What's in it

- Signed \`Node\` and \`Inventory\` announcements (ed25519).
- A sans-I/O gossip state machine: feed it messages, get back what to send.
- An in-memory store that keeps the newest announcement per peer and kind.
- \`Beacon::tick\` prunes announcements older than \`Config::max_age\`.
- Announcements more than \`Config::max_drift\` (30s) in the future are rejected.

### Known limitations

- No wire format: you bring your own framing.
- The rate limiter is a simple fixed window.

Thanks to everyone who ran pre-release builds on their seed nodes.`,
      artifacts: [
        { name: "beacon-0.1.0.crate", sizeBytes: 21_874 },
        { name: "beacon-0.1.0.tar.gz", sizeBytes: 24_311 },
        { name: "announce-0.1.0-x86_64-unknown-linux-gnu.tar.gz", sizeBytes: 1_184_502 },
      ],
    },
    {
      tag: "v0.2.0",
      at: "v0.2",
      title: "beacon 0.2.0: token buckets and a wire format",
      author: "tomas",
      daysAgo: 97,
      notes: `### Breaking

- The rate limiter is now a per-peer token bucket. \`Config::rate_limit\` and \`Config::rate_window\` are replaced by \`Config::rate\` (messages/s) and \`Config::burst\`.

  \`\`\`rust
  // 0.1
  Config { rate_limit: 64, rate_window: 1000, ..Default::default() }
  // 0.2
  Config { rate: 32, burst: 128, ..Default::default() }
  \`\`\`

### New

- \`beacon::wire\`: a small length-prefixed binary encoding for \`Message\`.
- Disconnected peers are forgotten after \`Config::peer_timeout\` (24h). This fixes the slow CPU creep on long-running seeds.
- \`PeerId: TryFrom<[u8; 32]>\`.

### Fixed

- Decoding no longer preallocates based on untrusted length prefixes.`,
      artifacts: [
        { name: "beacon-0.2.0.crate", sizeBytes: 29_402 },
        { name: "beacon-0.2.0.tar.gz", sizeBytes: 32_960 },
        { name: "announce-0.2.0-x86_64-unknown-linux-gnu.tar.gz", sizeBytes: 1_203_117 },
        { name: "announce-0.2.0-aarch64-unknown-linux-gnu.tar.gz", sizeBytes: 1_097_845 },
      ],
    },
    {
      tag: "v0.3.0",
      at: "v0.3",
      title: "beacon 0.3.0: fanout",
      author: "tomas",
      daysAgo: 39,
      notes: `### Changed

- New announcements are relayed to at most \`Config::fanout\` (default 8) randomly chosen peers instead of every connected peer. Set \`fanout: usize::MAX\` to get the old behaviour.
- MSRV is now **1.75**, following ed25519-dalek 2.1.

### New

- \`Beacon::stats()\` returns received / relayed / duplicate / rejected counters.

On the closet seed, outbound gossip traffic dropped by ~70% with no measurable change in convergence time.`,
      artifacts: [
        { name: "beacon-0.3.0.crate", sizeBytes: 31_288 },
        { name: "beacon-0.3.0.tar.gz", sizeBytes: 35_041 },
        { name: "announce-0.3.0-x86_64-unknown-linux-gnu.tar.gz", sizeBytes: 1_241_630 },
        { name: "SHA256SUMS", sizeBytes: 412 },
      ],
    },
  ],
};
