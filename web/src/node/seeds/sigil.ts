import type { RepoSeed } from "./types";

const readme = `# sigil

Ed25519 signatures for \`no_std\` Rust, with an API that makes the careful
choice the easy one.

\`\`\`rust
use sigil::{SigningKey, VerifyingKey};

let key = SigningKey::from_bytes(&seed);
let sig = key.sign(b"announce: v1.4.2");

let public = VerifyingKey::from_bytes(&key.verifying_key().to_bytes())?;
public.verify_strict(b"announce: v1.4.2", &sig)?;
\`\`\`

## Why another Ed25519 crate?

There are good ones already. sigil exists because we wanted:

- strict verification by default, with the cofactored variant clearly named
  and documented, instead of one \`verify\` whose exact rules you have to dig
  out of the source;
- no \`unsafe\`, no allocation unless you opt into it, and nothing else in
  the dependency tree beyond \`curve25519-dalek\` and \`sha2\`;
- a small enough surface that an audit fits in a week.

The curve arithmetic is curve25519-dalek's. sigil is the thin, opinionated
layer on top.

## Status

Pre-1.0. The API may still change between minor versions; the
verification rules will not change without a major version and a loud
CHANGELOG entry.

## License

MIT OR Apache-2.0, at your option.
`;

const license = `sigil is licensed under either of

- Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
- MIT license (https://opensource.org/licenses/MIT)

at your option. Unless you explicitly state otherwise, any contribution
you submit for inclusion in sigil shall be dual licensed as above, without
any additional terms or conditions.

Copyright (c) 2025 the Keystone contributors
`;

const cargoToml = `[package]
name = "sigil"
version = "0.1.0-dev"
edition = "2021"
rust-version = "1.65"
description = "Small, careful Ed25519 signatures for no_std targets"
license = "MIT OR Apache-2.0"
repository = "https://code.keystone.example.org/sigil"
keywords = ["ed25519", "signature", "no_std", "cryptography"]
categories = ["cryptography", "no-std"]

[features]
default = ["std"]
std = []

[dependencies]
curve25519-dalek = { version = "4.1", default-features = false, features = ["precomputed-tables"] }
sha2 = { version = "0.10", default-features = false }

[dev-dependencies]
hex-literal = "0.4"
`;

const changelogRoot = `# Changelog

## Unreleased

- Signing and verification (strict and cofactored) as in RFC 8032.
`;

const libRs = `//! Ed25519 signatures for \`no_std\` targets.
//!
//! sigil signs and verifies Ed25519 (RFC 8032) signatures and tries hard to
//! make the safe thing the obvious thing:
//!
//! - [\`VerifyingKey::verify_strict\`] is the default recommendation. It
//!   rejects small-order keys, small-order \`R\` and non-canonical \`s\`.
//! - [\`VerifyingKey::verify\`] uses the cofactored equation, which is what
//!   batch verification agrees with.
//! - [\`SigningKey\`] never prints its secret.
//!
//! \`\`\`
//! use sigil::SigningKey;
//!
//! let key = SigningKey::from_bytes(&[7u8; 32]);
//! let sig = key.sign(b"hello");
//! assert!(key.verifying_key().verify_strict(b"hello", &sig).is_ok());
//! \`\`\`

#![no_std]
#![forbid(unsafe_code)]
#![deny(missing_docs)]

#[cfg(feature = "std")]
extern crate std;

mod error;
mod signature;
mod signing;
mod verifying;

pub use error::Error;
pub use signature::{Signature, SIGNATURE_LENGTH};
pub use signing::{SigningKey, SECRET_KEY_LENGTH};
pub use verifying::{VerifyingKey, PUBLIC_KEY_LENGTH};
`;

const errorRs = `use core::fmt;

/// Why a key or signature was rejected.
///
/// Treat every variant as "invalid". The reason is there for logs and
/// tests, not for deciding what to do next.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    /// The public key is not a valid point encoding.
    InvalidPublicKey,
    /// The public key is a point of small order.
    WeakPublicKey,
    /// The signature's \`R\` is not a valid point encoding, or has small order.
    InvalidR,
    /// The signature's \`s\` is not reduced modulo the group order.
    NonCanonicalScalar,
    /// The signature does not match the key and message.
    Verification,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Error::InvalidPublicKey => "invalid public key encoding",
            Error::WeakPublicKey => "public key has small order",
            Error::InvalidR => "invalid signature R",
            Error::NonCanonicalScalar => "non-canonical signature scalar",
            Error::Verification => "signature verification failed",
        })
    }
}

#[cfg(feature = "std")]
impl std::error::Error for Error {}
`;

const signatureRs = `use core::fmt;

/// Length of an encoded signature in bytes.
pub const SIGNATURE_LENGTH: usize = 64;

/// An Ed25519 signature: the encoded point \`R\` followed by the scalar \`s\`.
///
/// Parsing never fails. Whether \`R\` decodes and \`s\` is canonical is
/// checked when the signature is verified, so that every rejection goes
/// through the same code path.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Signature {
    pub(crate) r: [u8; 32],
    pub(crate) s: [u8; 32],
}

impl Signature {
    /// Parse a signature from its 64-byte encoding.
    pub fn from_bytes(bytes: &[u8; SIGNATURE_LENGTH]) -> Self {
        let mut r = [0u8; 32];
        let mut s = [0u8; 32];
        r.copy_from_slice(&bytes[..32]);
        s.copy_from_slice(&bytes[32..]);
        Self { r, s }
    }

    /// The 64-byte encoding.
    pub fn to_bytes(&self) -> [u8; SIGNATURE_LENGTH] {
        let mut out = [0u8; SIGNATURE_LENGTH];
        out[..32].copy_from_slice(&self.r);
        out[32..].copy_from_slice(&self.s);
        out
    }

    /// The encoded \`R\` component.
    pub fn r_bytes(&self) -> &[u8; 32] {
        &self.r
    }

    /// The encoded \`s\` component.
    pub fn s_bytes(&self) -> &[u8; 32] {
        &self.s
    }
}

impl fmt::Debug for Signature {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Signature(")?;
        for b in self.to_bytes() {
            write!(f, "{b:02x}")?;
        }
        f.write_str(")")
    }
}
`;

const signingRs = `use curve25519_dalek::constants::ED25519_BASEPOINT_TABLE;
use curve25519_dalek::scalar::Scalar;
use sha2::{Digest, Sha512};

use crate::{Signature, VerifyingKey};

/// Length of a secret key seed in bytes.
pub const SECRET_KEY_LENGTH: usize = 32;

/// An Ed25519 secret key, kept with its expanded form so signing doesn't
/// hash the seed every time.
#[derive(Clone, Debug)]
pub struct SigningKey {
    seed: [u8; SECRET_KEY_LENGTH],
    scalar: Scalar,
    prefix: [u8; 32],
    public: VerifyingKey,
}

impl SigningKey {
    /// Derive a signing key from a 32-byte seed, as in RFC 8032 section 5.1.5.
    pub fn from_bytes(seed: &[u8; SECRET_KEY_LENGTH]) -> Self {
        let h: [u8; 64] = Sha512::digest(seed).into();
        let mut lower = [0u8; 32];
        lower.copy_from_slice(&h[..32]);
        lower[0] &= 248;
        lower[31] &= 127;
        lower[31] |= 64;
        let scalar = Scalar::from_bytes_mod_order(lower);
        let mut prefix = [0u8; 32];
        prefix.copy_from_slice(&h[32..]);
        let public = VerifyingKey::from_point(&scalar * ED25519_BASEPOINT_TABLE);
        Self { seed: *seed, scalar, prefix, public }
    }

    /// The 32-byte seed this key was created from.
    pub fn to_bytes(&self) -> [u8; SECRET_KEY_LENGTH] {
        self.seed
    }

    /// The matching public key.
    pub fn verifying_key(&self) -> VerifyingKey {
        self.public
    }

    /// Sign a message, as in RFC 8032 section 5.1.6.
    ///
    /// Signing is deterministic: the same key and message always give the
    /// same signature, and no randomness is needed.
    pub fn sign(&self, message: &[u8]) -> Signature {
        let mut h = Sha512::new();
        h.update(self.prefix);
        h.update(message);
        let r = Scalar::from_hash(h);
        let big_r = (&r * ED25519_BASEPOINT_TABLE).compress();

        let mut h = Sha512::new();
        h.update(big_r.as_bytes());
        h.update(self.public.as_bytes());
        h.update(message);
        let k = Scalar::from_hash(h);

        let s = k * self.scalar + r;
        Signature { r: big_r.to_bytes(), s: s.to_bytes() }
    }
}
`;

const verifyingRs = `use curve25519_dalek::edwards::{CompressedEdwardsY, EdwardsPoint};
use curve25519_dalek::scalar::Scalar;
use sha2::{Digest, Sha512};

use crate::{Error, Signature};

/// Length of an encoded public key in bytes.
pub const PUBLIC_KEY_LENGTH: usize = 32;

/// An Ed25519 public key.
#[derive(Clone, Copy, Debug)]
pub struct VerifyingKey {
    compressed: CompressedEdwardsY,
    point: EdwardsPoint,
}

impl VerifyingKey {
    /// Parse a public key. Fails if the bytes are not a point on the curve.
    ///
    /// Small-order keys parse successfully, so that [\`verify\`](Self::verify)
    /// can be used where other implementations accept them. Use
    /// [\`is_weak\`](Self::is_weak) or [\`verify_strict\`](Self::verify_strict)
    /// to reject them.
    pub fn from_bytes(bytes: &[u8; PUBLIC_KEY_LENGTH]) -> Result<Self, Error> {
        let compressed = CompressedEdwardsY(*bytes);
        let point = compressed.decompress().ok_or(Error::InvalidPublicKey)?;
        Ok(Self { compressed, point })
    }

    pub(crate) fn from_point(point: EdwardsPoint) -> Self {
        Self { compressed: point.compress(), point }
    }

    /// The 32-byte encoding.
    pub fn as_bytes(&self) -> &[u8; PUBLIC_KEY_LENGTH] {
        self.compressed.as_bytes()
    }

    /// The 32-byte encoding, by value.
    pub fn to_bytes(&self) -> [u8; PUBLIC_KEY_LENGTH] {
        self.compressed.to_bytes()
    }

    /// Whether this key is a point of small order. Anyone can produce a
    /// signature that verifies under such a key for many messages.
    pub fn is_weak(&self) -> bool {
        self.point.is_small_order()
    }

    /// Verify with the cofactored equation \`[8][s]B = [8]R + [8][k]A\`.
    ///
    /// This is the equation batch verification checks, so a signature that
    /// passes one passes the other. It accepts small-order keys and \`R\`.
    pub fn verify(&self, message: &[u8], signature: &Signature) -> Result<(), Error> {
        let (r, s, k) = self.prepare(message, signature)?;
        let sb_minus_ka = EdwardsPoint::vartime_double_scalar_mul_basepoint(&k, &-self.point, &s);
        if (sb_minus_ka - r).mul_by_cofactor().is_identity() {
            Ok(())
        } else {
            Err(Error::Verification)
        }
    }

    /// Verify with the cofactorless equation \`[s]B = R + [k]A\`, and reject
    /// small-order keys and small-order \`R\`.
    ///
    /// Prefer this unless you need to agree with batch verification.
    pub fn verify_strict(&self, message: &[u8], signature: &Signature) -> Result<(), Error> {
        if self.is_weak() {
            return Err(Error::WeakPublicKey);
        }
        let (r, s, k) = self.prepare(message, signature)?;
        if r.is_small_order() {
            return Err(Error::InvalidR);
        }
        let expected = EdwardsPoint::vartime_double_scalar_mul_basepoint(&k, &-self.point, &s);
        if expected.compress().as_bytes() == signature.r_bytes() {
            Ok(())
        } else {
            Err(Error::Verification)
        }
    }

    /// Decode \`R\` and \`s\` and compute the challenge \`k = H(R || A || M)\`.
    fn prepare(
        &self,
        message: &[u8],
        signature: &Signature,
    ) -> Result<(EdwardsPoint, Scalar, Scalar), Error> {
        let s = Option::from(Scalar::from_canonical_bytes(signature.s))
            .ok_or(Error::NonCanonicalScalar)?;
        let r = CompressedEdwardsY(signature.r)
            .decompress()
            .ok_or(Error::InvalidR)?;
        let mut h = Sha512::new();
        h.update(signature.r);
        h.update(self.compressed.as_bytes());
        h.update(message);
        Ok((r, s, Scalar::from_hash(h)))
    }
}
`;

const vectorsRs = `use hex_literal::hex;
use sigil::{Signature, SigningKey, VerifyingKey};

struct Vector {
    secret: [u8; 32],
    public: [u8; 32],
    message: &'static [u8],
    signature: [u8; 64],
}

// RFC 8032, section 7.1.
const RFC8032: &[Vector] = &[
    // TEST 1
    Vector {
        secret: hex!("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"),
        public: hex!("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"),
        message: b"",
        signature: hex!(
            "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"
        ),
    },
];

#[test]
fn rfc8032_sign() {
    for v in RFC8032 {
        let key = SigningKey::from_bytes(&v.secret);
        assert_eq!(key.verifying_key().to_bytes(), v.public);
        assert_eq!(key.sign(v.message).to_bytes(), v.signature);
    }
}

#[test]
fn rfc8032_verify() {
    for v in RFC8032 {
        let key = VerifyingKey::from_bytes(&v.public).unwrap();
        let sig = Signature::from_bytes(&v.signature);
        assert!(key.verify_strict(v.message, &sig).is_ok());
        assert!(key.verify(v.message, &sig).is_ok());
    }
}

#[test]
fn flipped_bit_fails() {
    let v = &RFC8032[0];
    let key = VerifyingKey::from_bytes(&v.public).unwrap();
    let mut bytes = v.signature;
    bytes[63] ^= 0x01;
    let sig = Signature::from_bytes(&bytes);
    assert!(key.verify_strict(v.message, &sig).is_err());
    assert!(key.verify(v.message, &sig).is_err());
}
`;

const ctRs = `//! Constant-time helpers.
//!
//! Verification only handles public data, so its timing is not a secret
//! leak in the usual sense. We compare in constant time anyway: it costs
//! nothing measurable, and it means nobody has to re-derive that argument
//! every time the code changes.

use subtle::ConstantTimeEq;

/// Compare two 32-byte strings without an early exit.
pub(crate) fn eq32(a: &[u8; 32], b: &[u8; 32]) -> bool {
    a.ct_eq(b).into()
}
`;

const checkSh = `#!/bin/sh
# What CI runs. Run it before sending a patch.
set -eu

cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
cargo test --no-default-features --lib
cargo build --no-default-features --target thumbv7em-none-eabihf
cargo doc --no-deps --all-features
`;

const toolchain = `[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
targets = ["thumbv7em-none-eabihf"]
`;

const verificationMd = `# Strict and cofactored verification

Ed25519 has one signing algorithm and, in practice, several verification
algorithms. They agree on every signature an honest signer produces and
disagree on a handful of crafted ones. That is harmless in most programs
and a consensus bug in the rest: if two nodes in a network disagree about
whether a message is validly signed, an attacker can split them.

sigil offers exactly two rules and names them.

## \`verify_strict\`

Checks the cofactorless equation

    [s]B = R + [k]A

and additionally rejects:

- public keys \`A\` of small order (\`Error::WeakPublicKey\`);
- \`R\` of small order (\`Error::InvalidR\`);
- \`s\` that is not reduced modulo the group order \`l\`
  (\`Error::NonCanonicalScalar\`).

It does not need a random number generator and cannot be batched.

## \`verify\`

Checks the cofactored equation

    [8][s]B = [8]R + [8][k]A

and rejects only non-canonical \`s\` and encodings that don't decode. It
accepts small-order keys and small-order \`R\`. It is the rule that batch
verification implements, so a single \`verify\` and a batch always agree.

## Which one?

| You are...                                   | Use              |
|----------------------------------------------|------------------|
| verifying one signature at a time            | \`verify_strict\`  |
| verifying thousands per second, in batches   | \`verify\` + batch |
| in a protocol where peers must agree         | pick one, write it in the spec, never mix |

Everything \`verify_strict\` accepts, \`verify\` accepts too. The reverse is
not true, and that difference is the whole reason this page exists.
`;

const edgeCasesRs = `//! Inputs where Ed25519 implementations are known to disagree, and what
//! each of sigil's verification functions does with them.

use hex_literal::hex;
use sigil::{Error, Signature, SigningKey, VerifyingKey};

// The identity point, encoded as y = 1.
const IDENTITY: [u8; 32] = hex!("0100000000000000000000000000000000000000000000000000000000000000");
// The point of order 2, (0, -1).
const ORDER_TWO: [u8; 32] = hex!("ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f");

#[test]
fn small_order_keys_parse_but_are_weak() {
    for bytes in [IDENTITY, ORDER_TWO] {
        let key = VerifyingKey::from_bytes(&bytes).unwrap();
        assert!(key.is_weak());
    }
}

#[test]
fn strict_rejects_identity_key_with_identity_r() {
    // With A and R both the identity and s = 0, the cofactored and the
    // cofactorless equation hold for every message.
    let key = VerifyingKey::from_bytes(&IDENTITY).unwrap();
    let mut sig = [0u8; 64];
    sig[..32].copy_from_slice(&IDENTITY);
    let sig = Signature::from_bytes(&sig);
    assert_eq!(key.verify_strict(b"anything", &sig), Err(Error::WeakPublicKey));
    assert!(key.verify(b"anything", &sig).is_ok());
}

#[test]
fn non_canonical_s_is_rejected_by_both() {
    let key = SigningKey::from_bytes(&[1u8; 32]);
    let mut bytes = key.sign(b"msg").to_bytes();
    // s + l is still 32 bytes long and congruent to s.
    add_group_order(&mut bytes[32..]);
    let sig = Signature::from_bytes(&bytes);
    let public = key.verifying_key();
    assert_eq!(public.verify_strict(b"msg", &sig), Err(Error::NonCanonicalScalar));
    assert_eq!(public.verify(b"msg", &sig), Err(Error::NonCanonicalScalar));
}

fn add_group_order(s: &mut [u8]) {
    const L: [u8; 32] = hex!("edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010");
    let mut carry = 0u16;
    for (byte, l) in s.iter_mut().zip(L) {
        let sum = *byte as u16 + l as u16 + carry;
        *byte = sum as u8;
        carry = sum >> 8;
    }
}
`;

const securityMd = `# Security policy

Please report vulnerabilities privately to security@keystone.example.org.
Our PGP key is at https://keystone.example.org/pgp.txt. Don't open a public
issue for anything you think might be exploitable.

We aim to acknowledge reports within three working days, and to ship a fix
and publish an advisory within 30 days. We credit reporters in the advisory
and the CHANGELOG unless you ask us not to.

## In scope

- Any input that \`verify_strict\` accepts and RFC 8032 (with the extra
  checks documented in \`docs/verification.md\`) rejects.
- Any disagreement between \`verify\` and batch verification.
- Panics on attacker-controlled input.
- Secret-dependent timing or memory access in signing or key derivation.
- Secret material that outlives the \`SigningKey\` it belongs to.

## Out of scope

- The curve arithmetic itself, which comes from curve25519-dalek. Please
  report those upstream (and tell us too, we'd like to know).
- Weaknesses that need an attacker to already hold your secret key.
`;

const fuzzCargo = `[package]
name = "sigil-fuzz"
version = "0.0.0"
publish = false
edition = "2021"

[package.metadata]
cargo-fuzz = true

[dependencies]
libfuzzer-sys = "0.4"
sigil = { path = "..", default-features = false }

# Keep the fuzz crate out of the parent workspace, so a plain
# \`cargo test\` at the root never tries to build libfuzzer.
[workspace]
members = ["."]

[[bin]]
name = "decode"
path = "fuzz_targets/decode.rs"
test = false
doc = false

[[bin]]
name = "verify"
path = "fuzz_targets/verify.rs"
test = false
doc = false
`;

const fuzzDecode = `#![no_main]

use libfuzzer_sys::fuzz_target;
use sigil::{Signature, VerifyingKey};

fuzz_target!(|data: &[u8]| {
    if data.len() < 32 {
        return;
    }
    let key: &[u8; 32] = data[..32].try_into().unwrap();
    if let Ok(public) = VerifyingKey::from_bytes(key) {
        // Re-encoding a decoded key must give a key that decodes again and
        // agrees about being weak.
        let again = VerifyingKey::from_bytes(&public.to_bytes()).unwrap();
        assert_eq!(again.is_weak(), public.is_weak());
    }
    if data.len() >= 96 {
        let sig: &[u8; 64] = data[32..96].try_into().unwrap();
        assert_eq!(&Signature::from_bytes(sig).to_bytes(), sig);
    }
});
`;

const fuzzVerify = `#![no_main]

use libfuzzer_sys::fuzz_target;
use sigil::{Signature, VerifyingKey};

// Layout: 32 bytes of public key, 64 bytes of signature, and the rest is the
// message. Verification must never panic, and strict acceptance must imply
// cofactored acceptance.
fuzz_target!(|data: &[u8]| {
    if data.len() < 96 {
        return;
    }
    let (key, rest) = data.split_at(32);
    let (sig, message) = rest.split_at(64);
    let Ok(key) = VerifyingKey::from_bytes(key.try_into().unwrap()) else {
        return;
    };
    let sig = Signature::from_bytes(sig.try_into().unwrap());
    let strict = key.verify_strict(message, &sig).is_ok();
    let cofactored = key.verify(message, &sig).is_ok();
    assert!(!strict || cofactored, "strict accepted what cofactored rejected");
});
`;

const fuzzSign = `#![no_main]

use libfuzzer_sys::fuzz_target;
use sigil::SigningKey;

// The first 32 bytes are a seed, the rest is the message. Every signature we
// produce must pass both verification rules.
fuzz_target!(|data: &[u8]| {
    if data.len() < 32 {
        return;
    }
    let (seed, message) = data.split_at(32);
    let key = SigningKey::from_bytes(seed.try_into().unwrap());
    let sig = key.sign(message);
    let public = key.verifying_key();
    assert!(public.verify_strict(message, &sig).is_ok());
    assert!(public.verify(message, &sig).is_ok());
});
`;

const benchRs = `use criterion::{black_box, criterion_group, criterion_main, Criterion};
use sigil::SigningKey;

fn single(c: &mut Criterion) {
    let key = SigningKey::from_bytes(&[42u8; 32]);
    let public = key.verifying_key();
    let message = [0u8; 256];
    let sig = key.sign(&message);

    c.bench_function("sign 256B", |b| b.iter(|| key.sign(black_box(&message))));
    c.bench_function("verify 256B", |b| {
        b.iter(|| public.verify(black_box(&message), black_box(&sig)))
    });
    c.bench_function("verify_strict 256B", |b| {
        b.iter(|| public.verify_strict(black_box(&message), black_box(&sig)))
    });
}

criterion_group!(benches, single);
criterion_main!(benches);
`;

const batchRs = `//! Batch verification.
//!
//! Checking many signatures at once is roughly twice as fast per signature
//! as checking them one by one, for batches of 64 or more. The catch: a
//! batch only tells you whether *every* signature is valid. If it fails,
//! fall back to [\`VerifyingKey::verify\`] on each item to find the bad one.
//!
//! Batch verification uses the cofactored equation. It accepts exactly the
//! signatures [\`VerifyingKey::verify\`] accepts, and some that
//! [\`VerifyingKey::verify_strict\`] rejects. Don't mix it with strict
//! verification in a protocol where nodes must agree on validity.

use alloc::vec::Vec;

use curve25519_dalek::constants::ED25519_BASEPOINT_POINT;
use curve25519_dalek::edwards::{CompressedEdwardsY, EdwardsPoint};
use curve25519_dalek::scalar::Scalar;
use curve25519_dalek::traits::{IsIdentity, VartimeMultiscalarMul};
use rand_core::CryptoRngCore;
use sha2::{Digest, Sha512};

use crate::{Error, Signature, VerifyingKey};

/// One message, its signature and the key it should verify under.
pub struct Item<'a> {
    /// The signed message.
    pub message: &'a [u8],
    /// The signature over \`message\`.
    pub signature: &'a Signature,
    /// The key that supposedly produced \`signature\`.
    pub key: &'a VerifyingKey,
}

/// Verify every item with one multiscalar multiplication.
///
/// \`rng\` supplies the random coefficients that stop an attacker from
/// crafting invalid signatures that cancel each other out. It must be a
/// cryptographically secure generator.
pub fn verify_batch<R: CryptoRngCore + ?Sized>(items: &[Item<'_>], rng: &mut R) -> Result<(), Error> {
    let n = items.len();
    let mut scalars: Vec<Scalar> = Vec::with_capacity(2 * n + 1);
    let mut points: Vec<EdwardsPoint> = Vec::with_capacity(2 * n + 1);
    let mut b_coefficient = Scalar::ZERO;

    for item in items {
        let s = Option::from(Scalar::from_canonical_bytes(item.signature.s))
            .ok_or(Error::NonCanonicalScalar)?;
        let r = CompressedEdwardsY(item.signature.r)
            .decompress()
            .ok_or(Error::InvalidR)?;
        let mut h = Sha512::new();
        h.update(item.signature.r);
        h.update(item.key.as_bytes());
        h.update(item.message);
        let k = Scalar::from_hash(h);

        // 128-bit coefficients are enough: a forgery has to guess them.
        let mut z = [0u8; 32];
        rng.fill_bytes(&mut z[..16]);
        let z = Scalar::from_bytes_mod_order(z);

        b_coefficient -= z * s;
        scalars.push(z);
        points.push(r);
        scalars.push(z * k);
        points.push(item.key.point());
    }
    scalars.push(b_coefficient);
    points.push(ED25519_BASEPOINT_POINT);

    let sum = EdwardsPoint::vartime_multiscalar_mul(&scalars, &points);
    if sum.mul_by_cofactor().is_identity() {
        Ok(())
    } else {
        Err(Error::Verification)
    }
}
`;

const batchRsR1 = `//! Batch verification.
//!
//! Faster than verifying one at a time for large batches, but only tells you
//! whether every signature is valid.

use alloc::vec::Vec;

use curve25519_dalek::constants::ED25519_BASEPOINT_POINT;
use curve25519_dalek::edwards::{CompressedEdwardsY, EdwardsPoint};
use curve25519_dalek::scalar::Scalar;
use curve25519_dalek::traits::{IsIdentity, VartimeMultiscalarMul};
use rand_core::CryptoRngCore;
use sha2::{Digest, Sha512};

use crate::{Error, Signature, VerifyingKey};

/// Verify a batch of \`(message, signature, key)\` triples.
pub fn verify_batch<R: CryptoRngCore + ?Sized>(
    items: &[(&[u8], &Signature, &VerifyingKey)],
    rng: &mut R,
) -> Result<(), Error> {
    let n = items.len();
    let mut scalars: Vec<Scalar> = Vec::with_capacity(2 * n + 1);
    let mut points: Vec<EdwardsPoint> = Vec::with_capacity(2 * n + 1);
    let mut b_coefficient = Scalar::ZERO;

    for (message, signature, key) in items {
        let s = Option::from(Scalar::from_canonical_bytes(signature.s))
            .ok_or(Error::NonCanonicalScalar)?;
        let r = CompressedEdwardsY(signature.r)
            .decompress()
            .ok_or(Error::InvalidR)?;
        let mut h = Sha512::new();
        h.update(signature.r);
        h.update(key.as_bytes());
        h.update(message);
        let k = Scalar::from_hash(h);

        let z = Scalar::random(rng);

        b_coefficient -= z * s;
        scalars.push(z);
        points.push(r);
        scalars.push(z * k);
        points.push(key.point());
    }
    scalars.push(b_coefficient);
    points.push(ED25519_BASEPOINT_POINT);

    let sum = EdwardsPoint::vartime_multiscalar_mul(&scalars, &points);
    if sum.mul_by_cofactor().is_identity() {
        Ok(())
    } else {
        Err(Error::Verification)
    }
}
`;

const batchTestsRs = `#![cfg(feature = "batch")]

use rand::rngs::OsRng;
use sigil::batch::{verify_batch, Item};
use sigil::{Signature, SigningKey, VerifyingKey};

fn fixture(n: u8) -> (Vec<Signature>, Vec<VerifyingKey>) {
    let keys: Vec<SigningKey> = (0..n).map(|i| SigningKey::from_bytes(&[i; 32])).collect();
    let sigs = keys.iter().map(|k| k.sign(b"batch")).collect();
    let publics = keys.iter().map(|k| k.verifying_key()).collect();
    (sigs, publics)
}

fn items<'a>(sigs: &'a [Signature], publics: &'a [VerifyingKey]) -> Vec<Item<'a>> {
    sigs.iter()
        .zip(publics)
        .map(|(signature, key)| Item { message: b"batch", signature, key })
        .collect()
}

#[test]
fn valid_batch_passes() {
    let (sigs, publics) = fixture(32);
    assert!(verify_batch(&items(&sigs, &publics), &mut OsRng).is_ok());
}

#[test]
fn one_bad_signature_fails_the_batch() {
    let (mut sigs, publics) = fixture(32);
    sigs[17] = SigningKey::from_bytes(&[3; 32]).sign(b"batch");
    assert!(verify_batch(&items(&sigs, &publics), &mut OsRng).is_err());
}

#[test]
fn batch_agrees_with_cofactored_verify() {
    let (sigs, publics) = fixture(8);
    for (sig, key) in sigs.iter().zip(&publics) {
        assert!(key.verify(b"batch", sig).is_ok());
    }
    assert!(verify_batch(&items(&sigs, &publics), &mut OsRng).is_ok());
}
`;

const changelog010 = `# Changelog

## 0.1.0

First release.

- \`SigningKey\`, \`VerifyingKey\` and \`Signature\`, following RFC 8032.
- \`VerifyingKey::verify_strict\` rejects small-order keys, small-order \`R\`
  and non-canonical \`s\`. \`VerifyingKey::verify\` uses the cofactored
  equation. See \`docs/verification.md\` for the difference.
- Secret key material is zeroized on drop, and \`SigningKey\`'s \`Debug\`
  output only shows the public key.
- Point comparisons in verification are constant-time.
- Builds with \`--no-default-features\` on \`thumbv7em-none-eabihf\`.
`;

const changelog020 = `# Changelog

## 0.2.0

- New \`batch\` feature: \`batch::verify_batch\` checks many signatures with
  one multiscalar multiplication. It uses the cofactored rule, like
  \`VerifyingKey::verify\`.
- **Security:** \`verify_strict\` now rejects public keys whose encoding is
  not canonical (y >= p). Before, two different byte strings for the same
  key were both accepted. Found by theo while fuzzing; also SIGIL-01 in the
  0.1 audit report.
- The per-signature nonce is zeroized after signing.
- \`TryFrom<&[u8]>\` for \`Signature\` and \`VerifyingKey\`, with a new
  \`Error::Length\` variant.
- Fuzz targets under \`fuzz/\` and criterion benchmarks under \`benches/\`.

## 0.1.0

First release.

- \`SigningKey\`, \`VerifyingKey\` and \`Signature\`, following RFC 8032.
- \`VerifyingKey::verify_strict\` rejects small-order keys, small-order \`R\`
  and non-canonical \`s\`. \`VerifyingKey::verify\` uses the cofactored
  equation. See \`docs/verification.md\` for the difference.
- Secret key material is zeroized on drop, and \`SigningKey\`'s \`Debug\`
  output only shows the public key.
- Point comparisons in verification are constant-time.
- Builds with \`--no-default-features\` on \`thumbv7em-none-eabihf\`.
`;

const changelog030 = `# Changelog

## 0.3.0

Breaking:

- \`Error\` is now \`#[non_exhaustive]\`. Match on it with a wildcard arm, or
  better, don't match on it at all.
- The minimum supported Rust version is now 1.70.

Added:

- \`SigningKey::generate\` behind the new \`rand_core\` feature.
- Batch benchmarks for 4 to 256 signatures.

Changed:

- \`batch::verify_batch\` returns early for an empty batch instead of
  doing a multiscalar multiplication of nothing.
- CI runs every fuzz target for a minute.

## 0.2.0

- New \`batch\` feature: \`batch::verify_batch\` checks many signatures with
  one multiscalar multiplication. It uses the cofactored rule, like
  \`VerifyingKey::verify\`.
- **Security:** \`verify_strict\` now rejects public keys whose encoding is
  not canonical (y >= p). Before, two different byte strings for the same
  key were both accepted. Found by theo while fuzzing; also SIGIL-01 in the
  0.1 audit report.
- The per-signature nonce is zeroized after signing.
- \`TryFrom<&[u8]>\` for \`Signature\` and \`VerifyingKey\`, with a new
  \`Error::Length\` variant.
- Fuzz targets under \`fuzz/\` and criterion benchmarks under \`benches/\`.

## 0.1.0

First release.

- \`SigningKey\`, \`VerifyingKey\` and \`Signature\`, following RFC 8032.
- \`VerifyingKey::verify_strict\` rejects small-order keys, small-order \`R\`
  and non-canonical \`s\`. \`VerifyingKey::verify\` uses the cofactored
  equation. See \`docs/verification.md\` for the difference.
- Secret key material is zeroized on drop, and \`SigningKey\`'s \`Debug\`
  output only shows the public key.
- Point comparisons in verification are constant-time.
- Builds with \`--no-default-features\` on \`thumbv7em-none-eabihf\`.
`;

export const sigil: RepoSeed = {
  owner: { org: "keystone" },
  name: "sigil",
  description:
    "Small, careful Ed25519 signatures for no_std Rust: strict and cofactored verification, batching, zeroizing keys.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["zeynep", "malik", "tomas"],
  threshold: 2,
  seeding: 41,
  files: {
    "README.md": readme,
    LICENSE: license,
    "Cargo.toml": cargoToml,
    "CHANGELOG.md": changelogRoot,
    "src/lib.rs": libRs,
    "src/error.rs": errorRs,
    "src/signature.rs": signatureRs,
    "src/signing.rs": signingRs,
    "src/verifying.rs": verifyingRs,
    "tests/vectors.rs": vectorsRs,
  },
  root: {
    label: "root",
    message: `Initial commit

Ed25519 signing plus two verification rules, strict and cofactored, on
top of curve25519-dalek. No allocation, no unsafe, and as little API as
we could get away with.`,
    author: "zeynep",
    daysAgo: 352,
  },
  history: [
    {
      label: "rfc-test-2",
      message: `tests: add RFC 8032 TEST 2

One-byte message. TEST 1 only covers the empty message, which hides
bugs in how the message is fed to the hash.`,
      author: "malik",
      daysAgo: 346,
      changes: {
        "tests/vectors.rs": [
          [
            "    },\n];\n",
            `    },
    // TEST 2
    Vector {
        secret: hex!("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb"),
        public: hex!("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c"),
        message: &[0x72],
        signature: hex!(
            "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"
        ),
    },
];
`,
          ],
        ],
      },
    },
    {
      label: "debug",
      message: `Don't print the secret in SigningKey's Debug output

The derived Debug impl printed the seed, the expanded scalar and the
nonce prefix. One stray dbg!() or a panic message with a key in it and
the secret is in somebody's log aggregator. Show the public key only.`,
      author: "malik",
      daysAgo: 338,
      changes: {
        "src/signing.rs": [
          [
            "use curve25519_dalek::constants::ED25519_BASEPOINT_TABLE;\n",
            "use core::fmt;\n\nuse curve25519_dalek::constants::ED25519_BASEPOINT_TABLE;\n",
          ],
          ["#[derive(Clone, Debug)]\n", "#[derive(Clone)]\n"],
          [
            "        Signature { r: big_r.to_bytes(), s: s.to_bytes() }\n    }\n}\n",
            `        Signature { r: big_r.to_bytes(), s: s.to_bytes() }
    }
}

impl fmt::Debug for SigningKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SigningKey")
            .field("public", &self.public)
            .finish_non_exhaustive()
    }
}
`,
          ],
        ],
      },
    },
    {
      label: "zeroize",
      message: `Zeroize secret key material on drop

The seed, expanded scalar and nonce prefix are wiped when a SigningKey
is dropped, and so are the intermediate hash and clamped scalar in
from_bytes. This doesn't help against copies the compiler makes on the
stack, but it covers the long-lived copy, which is the one that ends up
in core dumps.`,
      author: "malik",
      daysAgo: 330,
      changes: {
        "src/signing.rs": [
          [
            "use sha2::{Digest, Sha512};\n",
            "use sha2::{Digest, Sha512};\nuse zeroize::{Zeroize, ZeroizeOnDrop};\n",
          ],
          [
            "        let h: [u8; 64] = Sha512::digest(seed).into();\n",
            "        let mut h: [u8; 64] = Sha512::digest(seed).into();\n",
          ],
          [
            "        prefix.copy_from_slice(&h[32..]);\n",
            "        prefix.copy_from_slice(&h[32..]);\n        lower.zeroize();\n        h.zeroize();\n",
          ],
          [
            "impl fmt::Debug for SigningKey {",
            `impl Drop for SigningKey {
    fn drop(&mut self) {
        self.seed.zeroize();
        self.scalar.zeroize();
        self.prefix.zeroize();
    }
}

impl ZeroizeOnDrop for SigningKey {}

impl fmt::Debug for SigningKey {`,
          ],
        ],
        "Cargo.toml": [
          ['features = ["precomputed-tables"] }', 'features = ["precomputed-tables", "zeroize"] }'],
          [
            'sha2 = { version = "0.10", default-features = false }\n',
            'sha2 = { version = "0.10", default-features = false }\nzeroize = { version = "1.7", default-features = false }\n',
          ],
        ],
      },
    },
    {
      label: "ct",
      message: `Compare R in constant time in verify_strict

Verification only sees public data, so this is not fixing a leak. But
the next person to touch this code shouldn't have to work that out
again, and subtle's comparison costs a few nanoseconds.`,
      author: "zeynep",
      daysAgo: 318,
      changes: {
        "src/ct.rs": ctRs,
        "src/lib.rs": [["mod error;\n", "mod ct;\nmod error;\n"]],
        "src/verifying.rs": [
          ["use crate::{Error, Signature};\n", "use crate::{ct, Error, Signature};\n"],
          [
            "        if expected.compress().as_bytes() == signature.r_bytes() {\n",
            "        if ct::eq32(expected.compress().as_bytes(), signature.r_bytes()) {\n",
          ],
        ],
        "Cargo.toml": [
          [
            'sha2 = { version = "0.10", default-features = false }\n',
            'sha2 = { version = "0.10", default-features = false }\nsubtle = { version = "2.5", default-features = false }\n',
          ],
        ],
      },
    },
    {
      label: "ci",
      message: `Add a CI script and pin the toolchain components

ci/check.sh is what the CI job runs, so anyone can run the same thing
locally. It includes a no_std build for a Cortex-M target, which is the
check most likely to catch an accidental std import.`,
      author: "tomas",
      daysAgo: 305,
      changes: {
        "ci/check.sh": checkSh,
        "rust-toolchain.toml": toolchain,
      },
    },
    {
      label: "docs-verification",
      message: `docs: explain strict and cofactored verification

People keep asking which one to use, and the answer is long enough that
it doesn't belong in a rustdoc comment.`,
      author: "zeynep",
      daysAgo: 290,
      changes: {
        "docs/verification.md": verificationMd,
        "README.md": [
          [
            "## Status\n",
            `## Strict or cofactored?

Use \`verify_strict\` unless you are batching. If you are building a
protocol where peers must agree on which signatures are valid, read
[docs/verification.md](docs/verification.md) first.

## Status
`,
          ],
        ],
      },
    },
    {
      label: "edge-cases",
      message: `tests: cover small-order keys and non-canonical s

The cases where implementations disagree in practice: identity key with
identity R and s = 0, the order-2 point, and s + l. Each test says what
both verification rules do, so a change in either shows up as a failure
rather than a surprise.`,
      author: "tomas",
      daysAgo: 276,
      changes: {
        "tests/edge_cases.rs": edgeCasesRs,
      },
    },
    {
      label: "v0.1.0",
      message: `Release 0.1.0`,
      author: "zeynep",
      daysAgo: 262,
      changes: {
        "Cargo.toml": [['version = "0.1.0-dev"', 'version = "0.1.0"']],
        "CHANGELOG.md": changelog010,
      },
    },
    {
      label: "security",
      message: `Add SECURITY.md

Where to send reports, how fast we answer, and what we consider in
scope. The out-of-scope list is short on purpose.`,
      author: "malik",
      daysAgo: 255,
      changes: {
        "SECURITY.md": securityMd,
      },
    },
    {
      label: "fuzz",
      message: `Add cargo-fuzz targets for decoding and verification

decode: parsing keys and signatures never panics and round-trips.
verify: verification never panics, and anything verify_strict accepts,
verify accepts too.

The fuzz crate has its own [workspace] so it stays out of the normal
build.`,
      author: "theo",
      daysAgo: 241,
      changes: {
        "fuzz/Cargo.toml": fuzzCargo,
        "fuzz/fuzz_targets/decode.rs": fuzzDecode,
        "fuzz/fuzz_targets/verify.rs": fuzzVerify,
      },
    },
    {
      label: "noncanonical",
      message: `Reject non-canonical public key encodings in verify_strict

curve25519-dalek's decompress() accepts y values in [p, 2^255) and
reduces them, so 19 points have two encodings. Because the challenge
hash covers the encoding of A, both encodings verified, each with its
own signature: a key could be "different" while being the same point.

verify_strict now re-encodes A and rejects the key unless the encodings
match. verify keeps accepting both, as documented.

Reported by theo, who found it with a differential fuzzer.`,
      author: "zeynep",
      daysAgo: 228,
      changes: {
        "src/verifying.rs": [
          [
            "    pub fn verify_strict(&self, message: &[u8], signature: &Signature) -> Result<(), Error> {\n        if self.is_weak() {\n",
            "    pub fn verify_strict(&self, message: &[u8], signature: &Signature) -> Result<(), Error> {\n        if !ct::eq32(&self.point.compress().to_bytes(), self.as_bytes()) {\n            return Err(Error::InvalidPublicKey);\n        }\n        if self.is_weak() {\n",
          ],
          [
            "    /// small-order keys and small-order `R`.\n",
            "    /// small-order keys, non-canonical key encodings and small-order `R`.\n",
          ],
        ],
        "tests/edge_cases.rs": [
          [
            "fn add_group_order(",
            `#[test]
fn strict_rejects_non_canonical_public_keys() {
    // Encodings with y >= p decode to the same point as y - p. Only 19
    // values are affected, so try all of them.
    for offset in 0u8..19 {
        let mut bytes = hex!("edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f");
        bytes[0] += offset;
        let Ok(key) = VerifyingKey::from_bytes(&bytes) else {
            continue;
        };
        let sig = Signature::from_bytes(&[0u8; 64]);
        assert!(matches!(
            key.verify_strict(b"", &sig),
            Err(Error::InvalidPublicKey | Error::WeakPublicKey)
        ));
    }
}

fn add_group_order(`,
          ],
        ],
      },
    },
    {
      label: "fuzz-sign",
      message: `fuzz: add a sign-then-verify target

Any seed, any message: the signature we produce must pass both rules.
Cheap to run and it would have caught the clamping mistake I made in a
local branch last week.`,
      author: "theo",
      daysAgo: 219,
      changes: {
        "fuzz/fuzz_targets/sign.rs": fuzzSign,
        "fuzz/Cargo.toml": [
          [
            'name = "verify"\npath = "fuzz_targets/verify.rs"\ntest = false\ndoc = false\n',
            'name = "verify"\npath = "fuzz_targets/verify.rs"\ntest = false\ndoc = false\n\n[[bin]]\nname = "sign"\npath = "fuzz_targets/sign.rs"\ntest = false\ndoc = false\n',
          ],
        ],
      },
    },
    {
      label: "tryfrom",
      message: `Add TryFrom<&[u8]> for Signature and VerifyingKey

beacon gets keys and signatures as slices out of its wire format, and
every call site had the same try_into().map_err() dance. Wrong lengths
get their own Error::Length.`,
      author: "ada",
      daysAgo: 205,
      changes: {
        "src/error.rs": [
          [
            "    Verification,\n}\n",
            "    Verification,\n    /// A byte slice had the wrong length.\n    Length,\n}\n",
          ],
          [
            '            Error::Verification => "signature verification failed",\n',
            '            Error::Verification => "signature verification failed",\n            Error::Length => "wrong input length",\n',
          ],
        ],
        "src/signature.rs": [
          ["use core::fmt;\n", "use core::fmt;\n\nuse crate::Error;\n"],
          [
            '        f.write_str(")")\n    }\n}\n',
            `        f.write_str(")")
    }
}

impl TryFrom<&[u8]> for Signature {
    type Error = Error;

    fn try_from(bytes: &[u8]) -> Result<Self, Error> {
        let bytes: &[u8; SIGNATURE_LENGTH] = bytes.try_into().map_err(|_| Error::Length)?;
        Ok(Self::from_bytes(bytes))
    }
}
`,
          ],
        ],
        "src/verifying.rs": [
          [
            "        Ok((r, s, Scalar::from_hash(h)))\n    }\n}\n",
            `        Ok((r, s, Scalar::from_hash(h)))
    }
}

impl TryFrom<&[u8]> for VerifyingKey {
    type Error = Error;

    fn try_from(bytes: &[u8]) -> Result<Self, Error> {
        let bytes: &[u8; PUBLIC_KEY_LENGTH] = bytes.try_into().map_err(|_| Error::Length)?;
        Self::from_bytes(bytes)
    }
}
`,
          ],
        ],
      },
    },
    {
      label: "bench",
      message: `Add criterion benchmarks for sign, verify and verify_strict

Run with \`cargo bench\`. On my laptop (Ryzen 7 5800U): sign 17.9 us,
verify 41.2 us, verify_strict 44.6 us. The strict path pays for the
extra small-order checks and the re-encoding of A.`,
      author: "malik",
      daysAgo: 190,
      changes: {
        "benches/verify.rs": benchRs,
        "Cargo.toml": [
          [
            'hex-literal = "0.4"\n',
            'criterion = { version = "0.5", default-features = false }\nhex-literal = "0.4"\n\n[[bench]]\nname = "verify"\nharness = false\n',
          ],
        ],
      },
    },
    {
      label: "batch",
      message: `Add batch verification behind the batch feature

batch::verify_batch checks n signatures with one multiscalar
multiplication of 2n + 1 terms, using random 128-bit coefficients.
It implements the cofactored rule, so it agrees with
VerifyingKey::verify and is documented as not agreeing with
verify_strict.

Needs alloc for the scalar and point vectors.`,
      author: "zeynep",
      daysAgo: 172,
      changes: {
        "src/batch.rs": batchRs,
        "src/lib.rs": [
          [
            "#[cfg(feature = \"std\")]\nextern crate std;\n",
            "#[cfg(feature = \"std\")]\nextern crate std;\n\n#[cfg(feature = \"alloc\")]\nextern crate alloc;\n",
          ],
          ["mod ct;\n", "#[cfg(feature = \"batch\")]\npub mod batch;\nmod ct;\n"],
        ],
        "src/verifying.rs": [
          [
            "    /// The 32-byte encoding.\n",
            "    #[cfg(feature = \"batch\")]\n    pub(crate) fn point(&self) -> EdwardsPoint {\n        self.point\n    }\n\n    /// The 32-byte encoding.\n",
          ],
        ],
        "Cargo.toml": [
          [
            "std = []\n",
            'std = ["alloc"]\nalloc = ["curve25519-dalek/alloc"]\nbatch = ["alloc", "dep:rand_core"]\n',
          ],
          [
            'sha2 = { version = "0.10", default-features = false }\n',
            'rand_core = { version = "0.6", default-features = false, optional = true }\nsha2 = { version = "0.10", default-features = false }\n',
          ],
          ['hex-literal = "0.4"\n', 'hex-literal = "0.4"\nrand = "0.8"\n'],
        ],
      },
    },
    {
      label: "batch-tests",
      message: `batch: test that one bad signature fails the whole batch

Plus a check that batch and cofactored verify agree on the same inputs.`,
      author: "zeynep",
      daysAgo: 171,
      changes: {
        "tests/batch.rs": batchTestsRs,
      },
    },
    {
      label: "nonce-zeroize",
      message: `Zeroize the per-signature nonce after signing

r is as secret as the key: anyone who learns r for one signature can
solve s = r + k*a for the secret scalar. It was left on the stack when
sign() returned. Reported in the issue tracker.`,
      author: "malik",
      daysAgo: 150,
      changes: {
        "src/signing.rs": [
          ["        let r = Scalar::from_hash(h);\n", "        let mut r = Scalar::from_hash(h);\n"],
          [
            "        let s = k * self.scalar + r;\n",
            "        let s = k * self.scalar + r;\n        r.zeroize();\n",
          ],
        ],
      },
    },
    {
      label: "v0.2.0",
      message: `Release 0.2.0`,
      author: "zeynep",
      daysAgo: 140,
      changes: {
        "Cargo.toml": [['version = "0.1.0"', 'version = "0.2.0"']],
        "CHANGELOG.md": changelog020,
      },
    },
    {
      label: "readme-features",
      message: `README: document the feature flags

And stop claiming we depend on two crates. It's four now, all from
the RustCrypto and dalek families.`,
      author: "tomas",
      daysAgo: 128,
      changes: {
        "README.md": [
          [
            "the dependency tree beyond `curve25519-dalek` and `sha2`;\n",
            "the dependency tree beyond `curve25519-dalek`, `sha2`, `subtle` and\n  `zeroize`;\n",
          ],
          [
            "## Status\n",
            `## Features

| Feature  | Default | What it adds |
|----------|---------|--------------|
| \`std\`    | yes     | \`std::error::Error\` for \`Error\` (implies \`alloc\`) |
| \`alloc\`  | via std | nothing on its own; needed by \`batch\` |
| \`batch\`  | no      | \`batch::verify_batch\` (needs \`alloc\` and \`rand_core\`) |

For embedded targets, use \`default-features = false\`.

## Status
`,
          ],
        ],
      },
    },
    {
      label: "generate",
      message: `Add SigningKey::generate behind a rand_core feature

So callers don't have to fill a seed buffer themselves and then forget
to wipe it. The seed is zeroized before returning.`,
      author: "ada",
      daysAgo: 112,
      changes: {
        "src/signing.rs": [
          [
            "impl SigningKey {\n",
            `impl SigningKey {
    /// Generate a fresh key from a cryptographically secure RNG.
    #[cfg(feature = "rand_core")]
    pub fn generate<R: rand_core::CryptoRngCore + ?Sized>(rng: &mut R) -> Self {
        let mut seed = [0u8; SECRET_KEY_LENGTH];
        rng.fill_bytes(&mut seed);
        let key = Self::from_bytes(&seed);
        seed.zeroize();
        key
    }

`,
          ],
        ],
        "Cargo.toml": [
          [
            'batch = ["alloc", "dep:rand_core"]\n',
            'batch = ["alloc", "rand_core"]\nrand_core = ["dep:rand_core"]\n',
          ],
        ],
        "README.md": [
          [
            "| `batch`  | no      | `batch::verify_batch` (needs `alloc` and `rand_core`) |\n",
            "| `batch`  | no      | `batch::verify_batch` (needs `alloc` and `rand_core`) |\n| `rand_core` | no   | `SigningKey::generate` |\n",
          ],
        ],
      },
    },
    {
      label: "non-exhaustive",
      message: `Make Error non_exhaustive

We want to be able to add rejection reasons (there's a pending one for
non-canonical R) without a major version bump. This is the last time
adding a variant is a breaking change.`,
      author: "malik",
      daysAgo: 98,
      changes: {
        "src/error.rs": [
          [
            "#[derive(Clone, Copy, Debug, PartialEq, Eq)]\npub enum Error {\n",
            "#[derive(Clone, Copy, Debug, PartialEq, Eq)]\n#[non_exhaustive]\npub enum Error {\n",
          ],
        ],
      },
    },
    {
      label: "batch-empty",
      message: `batch: return early for an empty batch

It was already correct (the sum of nothing is the identity), but it
allocated two vectors and ran a multiscalar multiplication to find
that out. Documented and tested.`,
      author: "zeynep",
      daysAgo: 85,
      changes: {
        "src/batch.rs": [
          [
            "/// Verify every item with one multiscalar multiplication.\n///\n",
            "/// Verify every item with one multiscalar multiplication.\n///\n/// Returns `Ok(())` for an empty batch.\n///\n",
          ],
          [
            "    let n = items.len();\n",
            "    if items.is_empty() {\n        return Ok(());\n    }\n    let n = items.len();\n",
          ],
        ],
        "tests/batch.rs": [
          [
            "#[test]\nfn valid_batch_passes() {",
            "#[test]\nfn empty_batch_is_ok() {\n    assert!(verify_batch(&[], &mut OsRng).is_ok());\n}\n\n#[test]\nfn valid_batch_passes() {",
          ],
        ],
      },
    },
    {
      label: "fuzz-ci",
      message: `ci: run each fuzz target for a minute when cargo-fuzz is installed

A minute isn't going to find anything new, but it does catch targets
that stop compiling or panic on the existing corpus, which has happened
twice now.`,
      author: "theo",
      daysAgo: 70,
      changes: {
        "ci/check.sh": [
          [
            "cargo doc --no-deps --all-features\n",
            `cargo doc --no-deps --all-features

if command -v cargo-fuzz >/dev/null; then
    for target in decode verify sign; do
        (cd fuzz && cargo +nightly fuzz run "$target" -- -max_total_time=60)
    done
fi
`,
          ],
        ],
      },
    },
    {
      label: "bench-batch",
      message: `bench: add batch verification for 4 to 256 signatures

Per-signature cost on the same laptop: 4 -> 31 us, 16 -> 24 us,
64 -> 19 us, 256 -> 16.8 us, against 41 us for a single verify. Below
about 8 signatures batching is barely worth the allocation.`,
      author: "malik",
      daysAgo: 55,
      changes: {
        "benches/verify.rs": [
          [
            "criterion_group!(benches, single);\n",
            `#[cfg(feature = "batch")]
fn batch(c: &mut Criterion) {
    use sigil::batch::{verify_batch, Item};

    let mut group = c.benchmark_group("verify_batch");
    for n in [4usize, 16, 64, 256] {
        let keys: Vec<_> = (0..n).map(|i| SigningKey::from_bytes(&[i as u8; 32])).collect();
        let sigs: Vec<_> = keys.iter().map(|k| k.sign(b"bench")).collect();
        let publics: Vec<_> = keys.iter().map(|k| k.verifying_key()).collect();
        let items: Vec<_> = (0..n)
            .map(|i| Item { message: b"bench", signature: &sigs[i], key: &publics[i] })
            .collect();
        group.throughput(criterion::Throughput::Elements(n as u64));
        group.bench_function(n.to_string(), |b| {
            b.iter(|| verify_batch(black_box(&items), &mut rand::rngs::OsRng))
        });
    }
    group.finish();
}

#[cfg(not(feature = "batch"))]
fn batch(_: &mut Criterion) {}

criterion_group!(benches, single, batch);
`,
          ],
        ],
      },
    },
    {
      label: "side-channels",
      message: `SECURITY: spell out what we promise about side channels

Signing and key derivation: no secret-dependent branches or memory
access in our code, relying on curve25519-dalek's constant-time scalar
multiplication. Verification: variable-time, on purpose, because every
input is public. Power analysis and fault attacks: not covered.`,
      author: "zeynep",
      daysAgo: 42,
      changes: {
        "SECURITY.md": [
          [
            "- Weaknesses that need an attacker to already hold your secret key.\n",
            `- Weaknesses that need an attacker to already hold your secret key.

## Side channels

Signing and key derivation contain no secret-dependent branches or
memory accesses in sigil's own code, and use curve25519-dalek's
constant-time scalar multiplication for everything involving the
secret scalar or the nonce.

Verification is variable-time on purpose: the key, message and
signature are all public. If your protocol treats any of them as secret,
sigil is the wrong tool.

We make no claims about power analysis, electromagnetic emanations or
fault injection. If you are shipping sigil on a device an attacker can
hold, you need countermeasures below the library level.
`,
          ],
        ],
      },
    },
    {
      label: "msrv",
      message: `Bump MSRV to 1.70

curve25519-dalek 4.1.3 needs it, and so do let-else in the tests and
the dep: feature syntax we've been relying on since 0.2. CI already
built with stable, so nothing changes there.`,
      author: "tomas",
      daysAgo: 33,
      changes: {
        "Cargo.toml": [['rust-version = "1.65"', 'rust-version = "1.70"']],
      },
    },
    {
      label: "v0.3.0",
      message: `Release 0.3.0`,
      author: "zeynep",
      daysAgo: 21,
      changes: {
        "Cargo.toml": [['version = "0.2.0"', 'version = "0.3.0"']],
        "CHANGELOG.md": changelog030,
      },
    },
    {
      label: "malleability",
      message: `tests: reject signatures with the top bits of s set

A malleability check from the vectors I've been collecting: s with bit
255 set is always >= l and must fail both rules with
NonCanonicalScalar, not with a generic verification error.`,
      author: "theo",
      daysAgo: 12,
      changes: {
        "tests/edge_cases.rs": [
          [
            "fn add_group_order(",
            `#[test]
fn high_bit_in_s_is_non_canonical() {
    let key = SigningKey::from_bytes(&[9u8; 32]);
    let mut bytes = key.sign(b"msg").to_bytes();
    bytes[63] |= 0x80;
    let sig = Signature::from_bytes(&bytes);
    let public = key.verifying_key();
    assert_eq!(public.verify_strict(b"msg", &sig), Err(Error::NonCanonicalScalar));
    assert_eq!(public.verify(b"msg", &sig), Err(Error::NonCanonicalScalar));
}

fn add_group_order(`,
          ],
        ],
      },
    },
    {
      label: "readme-beacon",
      message: `README: add a "Used by" section

beacon moved its peer announcements over from ed25519-dalek last
month. Happy to list other users if they ask.`,
      author: "ada",
      daysAgo: 5,
      changes: {
        "README.md": [
          [
            "## License\n",
            `## Used by

- [beacon](https://lumen.example.org/beacon) signs and verifies its peer
  announcements with sigil, using \`verify_strict\` everywhere.

## License
`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "verify_strict accepts two encodings of the same public key",
      author: "theo",
      daysAgo: 236,
      body: `I've been running the \`verify\` target from my fuzz patch against a little harness that also calls a second Ed25519 implementation and compares results. After about six hours it flagged an input where sigil's \`verify_strict\` accepts and the other one rejects.

Minimised, the cause is the public key encoding. If the y coordinate is written as \`p + y\` instead of \`y\` (possible for y < 19, since 2^255 - 19 = p), \`VerifyingKey::from_bytes\` decodes it to the same point, but the challenge hash is computed over the bytes as given. So a signature made "for" the non-canonical encoding verifies, and so does a different signature for the canonical one.

I'm not sure this is exploitable on its own, but anything that uses the public key bytes as an identity (beacon does, as a peer ID) now has two IDs for one key. Didn't post the reproducer bytes here, sent them to security@ first and malik said it was fine to open this.`,
      labels: ["bug", "security"],
      assignees: ["zeynep"],
      state: "solved",
      closedHoursAfter: 200,
      comments: [
        {
          author: "malik",
          body: "Confirmed, thanks for going through the security address first. Only 19 field elements are affected and none of the resulting points are useful as real keys except a couple, but the identity problem is real. We'll fix verify_strict, and leave verify as is since it's documented as permissive.",
          hoursAfter: 6,
          reactions: [{ emoji: "🙏", by: ["theo"] }],
        },
        {
          author: "zeynep",
          body: "Should we reject at `from_bytes` instead? Then nobody can even hold a non-canonical VerifyingKey.",
          hoursAfter: 20,
        },
        {
          author: "malik",
          body: "I'd rather not. `verify` is meant to accept what other cofactored implementations accept, and some of those take non-canonical A. If from_bytes rejects, verify can't be used for interop at all. Put the check in verify_strict and say so in the docs.",
          hoursAfter: 23,
          replyTo: 1,
        },
        {
          author: "zeynep",
          body: "Fair. Patch is up, with a test that walks all 19 offsets.",
          hoursAfter: 190,
          replyTo: 2,
        },
        {
          author: "ada",
          body: "We'll make beacon canonicalise peer IDs on our side as well, belt and braces. Thanks theo.",
          hoursAfter: 210,
          reactions: [{ emoji: "👍", by: ["theo", "zeynep"] }],
        },
      ],
    },
    {
      title: "Should batch verification be usable alongside verify_strict?",
      author: "ada",
      daysAgo: 176,
      body: `Looking at the batch patch with beacon in mind. Our relays see a few thousand announcements a minute during churn, so batching would help, but every node currently runs \`verify_strict\` on each one.

If relays batch (cofactored) and end nodes verify strictly, a crafted announcement with a small-order component could be relayed by one and dropped by the other. Is that a real problem, or am I overthinking it?`,
      labels: ["question"],
      state: "solved",
      closedHoursAfter: 96,
      comments: [
        {
          author: "zeynep",
          body: "Not overthinking it, that is exactly the split the docs warn about. It only matters if a relay's decision has consequences someone else depends on. If relays forward and end nodes decide, a mismatch means some junk gets forwarded and then dropped. Annoying, not dangerous.",
          hoursAfter: 5,
        },
        {
          author: "tomas",
          body: "In beacon relays also rate-limit by peer ID based on what they've accepted, so a relay accepting more than end nodes would charge the wrong peers. Small, but it's a consequence.",
          hoursAfter: 9,
          replyTo: 0,
        },
        {
          author: "ada",
          body: "Right. Simplest answer for us: check `is_weak()` on every key before batching, and reject small-order R up front. Then the remaining difference is the cofactor on honest-looking signatures, which needs a deliberately malformed signer.",
          hoursAfter: 14,
          replyTo: 1,
        },
        {
          author: "zeynep",
          body: "That matches what I'd recommend. I've added a paragraph to the batch module docs pointing at this issue. Closing as answered, reopen if it bites.",
          hoursAfter: 96,
          reactions: [{ emoji: "✅", by: ["ada", "tomas"] }],
        },
      ],
    },
    {
      title: "The per-signature nonce r is never zeroized",
      author: "self",
      daysAgo: 155,
      body: `Reading through \`SigningKey::sign\` after the zeroize change: the seed, scalar and prefix are wiped on drop, but the nonce \`r\` computed in \`sign()\` is a plain \`Scalar\` that just goes out of scope.

Knowing \`r\` for a single signature is enough to recover the secret scalar from \`s = r + k·a\`, so it seems at least as sensitive as the prefix. Is there a reason it's left alone, or was it just missed?`,
      labels: ["security"],
      assignees: ["malik"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "malik",
          body: "Just missed. Good catch, and you're right about the severity relative to the prefix. I'll wipe it right after computing s.",
          hoursAfter: 4,
          reactions: [{ emoji: "👍", by: ["self"] }],
        },
        {
          author: "zeynep",
          body: "Worth noting in the audit addendum too, since the 0.1 review didn't flag it. I'll add it as a late finding.",
          hoursAfter: 11,
        },
        {
          author: "self",
          body: "Out of curiosity: the compiler can still leave copies of `r` in registers or spilled stack slots, right? Is zeroizing the named variable mostly about core dumps?",
          hoursAfter: 30,
        },
        {
          author: "malik",
          body: "Yes. Zeroize can't promise anything about copies it doesn't know about. It reliably handles the long-lived ones, which are what end up in dumps and swap. The SECURITY.md wording tries not to promise more than that.",
          hoursAfter: 34,
          replyTo: 2,
        },
      ],
    },
    {
      title: "Add SigningKey::generate",
      author: "tomas",
      daysAgo: 121,
      body: "Every user writes the same five lines: allocate a seed, fill it from an RNG, call from_bytes, and (if they remember) zeroize the seed. Could sigil do this behind an optional rand_core feature?",
      labels: ["enhancement"],
      state: "solved",
      closedHoursAfter: 215,
      comments: [
        {
          author: "zeynep",
          body: "Yes, as long as it's optional. The `batch` feature already pulls rand_core in, so it's no new dependency.",
          hoursAfter: 8,
        },
        {
          author: "ada",
          body: "I have this in beacon already, happy to upstream it.",
          hoursAfter: 26,
          reactions: [{ emoji: "🎉", by: ["tomas"] }],
        },
      ],
    },
    {
      title: "Callers are branching on Error variants",
      author: "malik",
      daysAgo: 104,
      body: `Going through code search for sigil users: two projects \`match\` on \`Error\` and treat \`WeakPublicKey\` as "retry with verify". That's precisely the downgrade we don't want.

Options:
1. Collapse everything into one opaque error.
2. Keep the variants for logging but mark the enum \`#[non_exhaustive]\` and say loudly in the docs not to branch.
3. Do nothing.

I lean towards 2. 1 makes debugging miserable.`,
      labels: ["question", "enhancement"],
      state: "solved",
      closedHoursAfter: 140,
      comments: [
        {
          author: "tomas",
          body: "2. And maybe a clippy-style note in the README. Opaque errors drove me up the wall in another crypto crate when a test vector failed and I couldn't tell why.",
          hoursAfter: 10,
        },
        {
          author: "zeynep",
          body: "2, with the breaking change in 0.3. non_exhaustive doesn't stop anyone matching on a specific variant, but it's a strong hint and the docs already say treat everything as invalid.",
          hoursAfter: 22,
        },
        {
          author: "noor",
          body: "Outsider view: I'd find a `kind()` that groups into Malformed / Rejected more useful than the raw variants for metrics. Not a blocker.",
          hoursAfter: 48,
        },
        {
          author: "malik",
          body: "Going with non_exhaustive for 0.3. noor, a grouping helper is a reasonable follow-up if more people ask.",
          hoursAfter: 140,
          replyTo: 2,
        },
      ],
    },
    {
      title: "Build fails on thumbv6m-none-eabi",
      author: "diego",
      daysAgo: 94,
      body: `\`cargo build --target thumbv6m-none-eabi --no-default-features\` fails inside curve25519-dalek:

\`\`\`
error[E0599]: no method named \`compare_exchange\` found for struct \`AtomicUsize\`
\`\`\`

thumbv7em works fine. Is v6m (Cortex-M0) supposed to be supported?`,
      labels: ["bug", "question"],
      state: "closed",
      closedHoursAfter: 70,
      comments: [
        {
          author: "tomas",
          body: "That comes from the `precomputed-tables` feature, which needs atomics for lazy init on some versions. M0 has no CAS. Can you try with dalek's tables disabled? You'd need a sigil feature to turn them off, which we don't have.",
          hoursAfter: 6,
        },
        {
          author: "diego",
          body: "Patched Cargo.toml locally to drop precomputed-tables and it builds. Signing goes from ~40 ms to ~110 ms on the M0, which is fine for my use (one signature per sensor reading, every 10 minutes).",
          hoursAfter: 30,
          replyTo: 0,
        },
        {
          author: "zeynep",
          body: "We're only going to promise thumbv7em for now since that's what CI builds. Closing, but I've noted the feature idea; if a second person needs M0 we'll add a `small-tables` feature.",
          hoursAfter: 70,
        },
      ],
    },
    {
      title: "verify_strict is ~8% slower than verify",
      author: "yuki",
      daysAgo: 58,
      body: `From \`cargo bench\` on an M2: verify 38.9 µs, verify_strict 42.1 µs. For a single call that's irrelevant, but beacon-style relays do this a lot.

Most of it seems to be \`self.point.compress()\` on every call for the canonical-encoding check. VerifyingKey is usually long-lived; could we check canonicity once in from_bytes and store a flag?`,
      labels: ["perf"],
      assignees: ["malik"],
      comments: [
        {
          author: "malik",
          body: "Compressing is a field inversion, so yes, it shows up. Caching a `canonical: bool` at parse time is cheap and doesn't change behaviour. I'll fold it into the prepared-key work.",
          hoursAfter: 12,
        },
        {
          author: "zeynep",
          body: "Fine by me as long as the flag is computed in exactly one place. I don't want a second constructor that forgets it.",
          hoursAfter: 20,
          replyTo: 0,
        },
        {
          author: "yuki",
          body: "Small-order check is also per call (`is_small_order` multiplies by 8). Same trick?",
          hoursAfter: 26,
        },
        {
          author: "malik",
          body: "Same trick. Both are properties of the key, not of the signature.",
          hoursAfter: 27,
          replyTo: 2,
          reactions: [{ emoji: "👍", by: ["yuki"] }],
        },
      ],
    },
    {
      title: "Optional serde support",
      author: "priya",
      daysAgo: 54,
      body: "I store public keys in a JSON config and currently wrap VerifyingKey in a newtype just to derive Serialize/Deserialize. Would you take a `serde` feature?",
      labels: ["enhancement"],
      state: "closed",
      closedHoursAfter: 90,
      comments: [
        {
          author: "zeynep",
          body: "I wrote up my reasoning on the patch, but short version: deserializing a VerifyingKey from JSON would silently accept weak keys, and what encoding (hex? base64? array?) is a choice that belongs to the application. A newtype is the right place for both decisions.",
          hoursAfter: 40,
        },
        {
          author: "priya",
          body: "That's reasonable. I hadn't thought about weak keys coming in through config. Closing.",
          hoursAfter: 90,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Ed25519ph and Ed25519ctx?",
      author: "kofi",
      daysAgo: 31,
      body: "Is there any plan to support the prehashed or context variants from RFC 8032? We'd like to sign multi-gigabyte buoy archives without holding them in memory.",
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 50,
      comments: [
        {
          author: "zeynep",
          body: "No plans. Both variants are rarely interoperable in practice and they double the surface we'd need to audit. For large files, hash with SHA-512 (or BLAKE3) yourself and sign the digest with plain Ed25519, and put the hash function in your format's spec.",
          hoursAfter: 9,
        },
        {
          author: "kofi",
          body: "That's what we ended up doing. Thanks for the straight answer.",
          hoursAfter: 50,
        },
      ],
    },
    {
      title: "Document the MSRV policy",
      author: "self",
      daysAgo: 27,
      body: "0.3.0 bumped the MSRV to 1.70 in a minor release. That's fine pre-1.0, but it would help to have the policy written down in the README: how far behind stable do you support, and is an MSRV bump a breaking change?",
      labels: ["docs", "good-first-issue"],
      comments: [
        {
          author: "tomas",
          body: "Our informal rule has been \"whatever curve25519-dalek needs, and at least six months old\". Agree it should be written down. Want to send a patch?",
          hoursAfter: 15,
        },
        {
          author: "self",
          body: "Sure, I'll put something up.",
          hoursAfter: 40,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Should the fuzz corpus live in the repo?",
      author: "theo",
      daysAgo: 15,
      body: `The corpus I've built up is about 40 MB and 18k files. Without it, the one-minute CI fuzz runs start from nothing and mostly re-discover trivial inputs.

Options: commit a minimised corpus (\`cargo fuzz cmin\` gets it to ~2 MB), keep it in a separate repo, or publish it as a release artifact.`,
      labels: ["question"],
      comments: [
        {
          author: "malik",
          body: "2 MB in-tree is fine with me. A separate repo always drifts.",
          hoursAfter: 4,
        },
        {
          author: "zeynep",
          body: "I'd prefer separate, honestly. Every clone pays for it forever, and almost nobody runs the fuzzers. A release artifact keyed to the sigil version would be my pick.",
          hoursAfter: 9,
        },
        {
          author: "theo",
          body: "Artifact is fine for CI, but then the corpus and the targets can get out of sync when someone changes an input layout. I can live with that if we write the layout version into the file name.",
          hoursAfter: 13,
          replyTo: 1,
        },
      ],
    },
    {
      title: "VerifyingKey doesn't implement Eq or Hash",
      author: "tomas",
      daysAgo: 17,
      body: "beacon keeps a `HashMap<VerifyingKey, PeerState>` and currently has to key it by `[u8; 32]` and re-parse. Is there a reason VerifyingKey doesn't implement `PartialEq`, `Eq` and `Hash`?",
      labels: ["enhancement"],
      assignees: ["tomas"],
      comments: [
        {
          author: "malik",
          body: "Only that nobody asked. The question is what equality means: same encoding, or same point? With non-canonical encodings those differ.",
          hoursAfter: 3,
        },
        {
          author: "tomas",
          body: "Encoding. That's what's on the wire and what the challenge hash commits to. Patch coming.",
          hoursAfter: 5,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Signature::from_bytes accepts garbage",
      author: "noor",
      daysAgo: 8,
      body: "`Signature::from_bytes(&[0xff; 64])` succeeds. I expected parsing to reject a non-canonical `s` up front, like VerifyingKey::from_bytes rejects bad points. Is this intentional?",
      labels: ["question"],
      comments: [
        {
          author: "zeynep",
          body: "Intentional, and documented on the type: every rejection goes through verify, so there's one place to audit. VerifyingKey is different because you can't do anything with a key that isn't a point.",
          hoursAfter: 7,
        },
        {
          author: "noor",
          body: "Makes sense, though I'd still like a `Signature::is_canonical()` for logging bad input early. Happy to send it if that's welcome.",
          hoursAfter: 20,
          replyTo: 0,
        },
      ],
    },
  ],
  patches: [
    {
      title: "Add cargo-fuzz targets",
      author: "theo",
      daysAgo: 243,
      labels: ["testing"],
      state: "merged",
      revisions: [
        {
          description:
            "Two fuzz targets: `decode` (parsing keys and signatures never panics) and `verify` (verification never panics, and the two rules agree). Run with `cargo +nightly fuzz run verify`.",
          hoursAfter: 0,
          base: "security",
          commits: [
            {
              message: `Add cargo-fuzz targets for decoding and verification`,
              author: "theo",
              daysAgo: 243,
              changes: {
                "fuzz/Cargo.toml": `[package]
name = "sigil-fuzz"
version = "0.0.0"
publish = false
edition = "2021"

[package.metadata]
cargo-fuzz = true

[dependencies]
libfuzzer-sys = "0.4"
sigil = { path = ".." }

[[bin]]
name = "decode"
path = "fuzz_targets/decode.rs"

[[bin]]
name = "verify"
path = "fuzz_targets/verify.rs"
`,
                "fuzz/fuzz_targets/decode.rs": fuzzDecode,
                "fuzz/fuzz_targets/verify.rs": `#![no_main]

use libfuzzer_sys::fuzz_target;
use sigil::{Signature, VerifyingKey};

fuzz_target!(|data: &[u8]| {
    if data.len() < 96 {
        return;
    }
    let (key, rest) = data.split_at(32);
    let (sig, message) = rest.split_at(64);
    let Ok(key) = VerifyingKey::from_bytes(key.try_into().unwrap()) else {
        return;
    };
    let sig = Signature::from_bytes(sig.try_into().unwrap());
    let strict = key.verify_strict(message, &sig).is_ok();
    let cofactored = key.verify(message, &sig).is_ok();
    assert_eq!(strict, cofactored);
});
`,
              },
            },
          ],
          reviews: [
            {
              author: "zeynep",
              hoursAfter: 9,
              summary: "Very happy to have these. One logic problem and one build nit.",
              comments: [
                {
                  body: "These two aren't supposed to agree: strict rejects small-order keys and R that cofactored accepts, so this will fire on the first identity-key input the fuzzer finds. What should hold is `strict => cofactored`, i.e. `assert!(!strict || cofactored)`.",
                  path: "fuzz/fuzz_targets/verify.rs",
                  line: 18,
                },
                {
                  body: "Could the fuzz crate get its own `[workspace]`? Otherwise `cargo test` in the root picks it up on some setups and tries to build libfuzzer with stable.",
                  path: "fuzz/Cargo.toml",
                  line: 12,
                },
                {
                  body: "Also `default-features = false` here, so we fuzz the no_std build, which is what embedded users actually get.",
                  path: "fuzz/Cargo.toml",
                  line: 12,
                },
              ],
            },
            {
              author: "malik",
              hoursAfter: 12,
              summary: "+1 to zeynep's comments. A short header comment in verify.rs describing the input layout would help whoever triages crashes later.",
            },
          ],
        },
        {
          description:
            "Asserts the implication instead of equality, documents the input layout, puts the fuzz crate in its own workspace and builds sigil without default features.",
          hoursAfter: 40,
          fromHistory: ["fuzz"],
          reviews: [
            {
              author: "zeynep",
              hoursAfter: 50,
              verdict: "accept",
              summary: "Thanks theo. Merging.",
              comments: [
                {
                  body: "Nice, this is the property worth having.",
                  path: "fuzz/fuzz_targets/verify.rs",
                  line: 21,
                  resolved: true,
                },
              ],
            },
            {
              author: "malik",
              hoursAfter: 51,
              verdict: "accept",
              summary: "LGTM.",
            },
          ],
          comments: [
            {
              author: "theo",
              body: "Ran both targets for 12 hours each on the fixed version. `verify` found something interesting along the way, opening a separate issue (via security@ first).",
              hoursAfter: 44,
              reactions: [{ emoji: "👀", by: ["malik", "zeynep"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Batch verification",
      author: "zeynep",
      daysAgo: 178,
      labels: ["enhancement", "perf"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds `batch::verify_batch` behind a new `batch` feature (needs alloc and rand_core). One multiscalar multiplication for the whole batch, cofactored equation.",
          hoursAfter: 0,
          base: "bench",
          commits: [
            {
              message: `Add batch verification behind the batch feature`,
              author: "zeynep",
              daysAgo: 178,
              changes: {
                "src/batch.rs": batchRsR1,
                "src/lib.rs": [
                  [
                    "#[cfg(feature = \"std\")]\nextern crate std;\n",
                    "#[cfg(feature = \"std\")]\nextern crate std;\n\n#[cfg(feature = \"alloc\")]\nextern crate alloc;\n",
                  ],
                  ["mod ct;\n", "#[cfg(feature = \"batch\")]\npub mod batch;\nmod ct;\n"],
                ],
                "src/verifying.rs": [
                  [
                    "    /// The 32-byte encoding.\n",
                    "    pub(crate) fn point(&self) -> EdwardsPoint {\n        self.point\n    }\n\n    /// The 32-byte encoding.\n",
                  ],
                ],
                "Cargo.toml": [
                  [
                    "std = []\n",
                    'std = ["alloc"]\nalloc = ["curve25519-dalek/alloc"]\nbatch = ["alloc", "dep:rand_core"]\n',
                  ],
                  [
                    'sha2 = { version = "0.10", default-features = false }\n',
                    'rand_core = { version = "0.6", default-features = false, optional = true }\nsha2 = { version = "0.10", default-features = false }\n',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "malik",
              hoursAfter: 20,
              verdict: "reject",
              summary:
                "The maths is right. I'd like the API and the docs to be harder to misuse before this goes in.",
              comments: [
                {
                  body: "Tuples of three references are easy to get in the wrong order, and message/signature are both byte-ish. A small `Item { message, signature, key }` struct would make call sites self-describing.",
                  path: "src/batch.rs",
                  line: 19,
                },
                {
                  body: "Full-width random scalars are overkill: 128-bit coefficients give 2^-128 forgery probability and make the z*s and z*k multiplications cheaper. Fill 16 bytes, reduce.",
                  path: "src/batch.rs",
                  line: 39,
                },
                {
                  body: "The module docs need to say, prominently, that this is the cofactored rule and will accept things verify_strict rejects. That's the single most important fact about this function.",
                  path: "src/batch.rs",
                  line: 1,
                  endLine: 4,
                },
                {
                  body: "`point()` is only used by batch; gate it on the feature or clippy will warn about dead code in no-default builds.",
                  path: "src/verifying.rs",
                  line: 34,
                },
              ],
            },
          ],
          comments: [
            {
              author: "ada",
              body: "Very interested in this for beacon relays. I opened a separate question about mixing it with verify_strict, since that's what our end nodes use.",
              hoursAfter: 26,
            },
          ],
        },
        {
          description:
            "Introduces `batch::Item`, uses 128-bit coefficients, gates `VerifyingKey::point` on the feature, and expands the module docs about cofactored vs strict. Adds tests, including one that checks batch and `verify` agree.",
          hoursAfter: 140,
          fromHistory: ["batch", "batch-tests"],
          reviews: [
            {
              author: "malik",
              hoursAfter: 150,
              verdict: "accept",
              summary: "All addressed. The new module docs are exactly what I wanted.",
              comments: [
                {
                  body: "Good comment, it'll save the next reviewer from asking the same question.",
                  path: "src/batch.rs",
                  line: 57,
                  resolved: true,
                },
              ],
            },
            {
              author: "tomas",
              hoursAfter: 158,
              verdict: "accept",
              summary:
                "Ran the benches: 64-signature batches are 2.1x faster per signature than single verify on my machine. Nice.",
            },
          ],
        },
      ],
    },
    {
      title: "Implement Eq, Hash and Ord for VerifyingKey",
      author: "tomas",
      daysAgo: 16,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "Equality and hashing are on the 32-byte encoding, not the point, so two different encodings of one point are different keys. That matches what the challenge hash commits to and what peers see on the wire.",
          hoursAfter: 0,
          base: "v0.3.0",
          commits: [
            {
              message: `Implement PartialEq, Eq and Hash for VerifyingKey

Compares and hashes the encoding. Equality uses ct::eq32 for
consistency with the rest of the crate, even though keys are public.`,
              author: "tomas",
              daysAgo: 16,
              changes: {
                "src/verifying.rs": [
                  [
                    "impl TryFrom<&[u8]> for VerifyingKey {",
                    `impl PartialEq for VerifyingKey {
    fn eq(&self, other: &Self) -> bool {
        ct::eq32(self.as_bytes(), other.as_bytes())
    }
}

impl Eq for VerifyingKey {}

impl core::hash::Hash for VerifyingKey {
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        self.as_bytes().hash(state);
    }
}

impl TryFrom<&[u8]> for VerifyingKey {`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "malik",
              hoursAfter: 18,
              summary: "Looks right. Two requests.",
              comments: [
                {
                  body: "Please say on the type's docs that equality is by encoding. Somebody will assume it's by point, and with non-canonical encodings those differ.",
                  path: "src/verifying.rs",
                  line: 111,
                },
                {
                  body: "A test that `Hash` agrees with `Eq` for a couple of keys (including a non-canonical encoding of a weak point) would be good.",
                  path: "src/verifying.rs",
                  line: 119,
                  endLine: 123,
                },
              ],
            },
          ],
          comments: [
            {
              author: "zeynep",
              body: "Could we get `Ord` in the same patch? beacon also has a BTreeMap of keys for deterministic gossip order, if I remember right.",
              hoursAfter: 22,
            },
            {
              author: "ada",
              body: "We do, yes. Byte order is all we need.",
              hoursAfter: 24,
              replyTo: 0,
            },
          ],
        },
        {
          description:
            "Adds `PartialOrd` and `Ord` (byte order of the encoding), documents that equality is by encoding, and adds tests.",
          hoursAfter: 50,
          commits: [
            {
              message: `Add Ord for VerifyingKey and document encoding equality`,
              author: "tomas",
              daysAgo: 14,
              changes: {
                "src/verifying.rs": [
                  [
                    "/// An Ed25519 public key.\n",
                    "/// An Ed25519 public key.\n///\n/// Equality, hashing and ordering are by the 32-byte encoding, not the\n/// point: two encodings of the same point are different keys.\n",
                  ],
                  [
                    "impl TryFrom<&[u8]> for VerifyingKey {",
                    `impl PartialOrd for VerifyingKey {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for VerifyingKey {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.as_bytes().cmp(other.as_bytes())
    }
}

impl TryFrom<&[u8]> for VerifyingKey {`,
                  ],
                ],
                "tests/edge_cases.rs": [
                  [
                    "fn add_group_order(",
                    `#[test]
fn keys_compare_by_encoding() {
    use std::collections::HashSet;

    let a = SigningKey::from_bytes(&[1u8; 32]).verifying_key();
    let b = VerifyingKey::from_bytes(&a.to_bytes()).unwrap();
    let c = SigningKey::from_bytes(&[2u8; 32]).verifying_key();
    assert_eq!(a, b);
    assert_ne!(a, c);
    let set: HashSet<_> = [a, b, c].into_iter().collect();
    assert_eq!(set.len(), 2);
}

fn add_group_order(`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "malik",
              hoursAfter: 60,
              verdict: "accept",
              summary: "Thanks. Approving; zeynep had opinions on Ord so I'll leave the merge to her.",
              comments: [
                {
                  body: "Doc comment is clear, thanks.",
                  path: "src/verifying.rs",
                  line: 12,
                  resolved: true,
                },
              ],
            },
            {
              author: "self",
              hoursAfter: 70,
              summary:
                "Drive-by: the test covers two encodings of the same canonical key, which are byte-identical anyway. Malik's request was about a non-canonical encoding of a weak point, e.g. y = p + 1 next to y = 1.",
              comments: [
                {
                  body: "`b` is just `a` re-encoded, so this assertion would pass even if Eq compared points. A non-canonical pair would actually exercise the documented behaviour.",
                  path: "tests/edge_cases.rs",
                  line: 69,
                },
              ],
            },
          ],
          comments: [
            {
              author: "tomas",
              body: "Fair point from the drive-by review, I'll add the p + 1 case.",
              hoursAfter: 74,
              reactions: [{ emoji: "👍", by: ["self"] }],
            },
          ],
        },
      ],
    },
    {
      title: "README: document the MSRV policy",
      author: "self",
      daysAgo: 3,
      labels: ["docs"],
      state: "open",
      revisions: [
        {
          description:
            "Writes down the rule from the MSRV issue: we support whatever curve25519-dalek requires, never a Rust release younger than six months, and before 1.0 an MSRV bump is allowed in a minor release with a CHANGELOG entry.",
          hoursAfter: 0,
          base: "readme-beacon",
          commits: [
            {
              message: `README: document the MSRV policy`,
              author: "self",
              daysAgo: 3,
              changes: {
                "README.md": [
                  [
                    "## Used by\n",
                    `## Minimum supported Rust version

sigil builds on Rust 1.70 and newer. We raise the MSRV when
curve25519-dalek does, and never to a Rust release less than six months
old. Before 1.0, an MSRV bump can happen in a minor release and is
always listed in the CHANGELOG.

## Used by
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "tomas",
              hoursAfter: 6,
              verdict: "accept",
              summary: "Thanks, this is what we've been doing. One nit, not blocking.",
              comments: [
                {
                  body: "Maybe \"tested in CI\" instead of \"builds\" once we add an MSRV job, but that's a separate change.",
                  path: "README.md",
                  line: 56,
                },
              ],
            },
          ],
          comments: [
            {
              author: "zeynep",
              body: "Six months is fine. Let's also say what happens after 1.0 (bump = minor, not major?) so we don't have this discussion again then.",
              hoursAfter: 10,
            },
          ],
        },
      ],
    },
    {
      title: "Add optional serde support",
      author: "priya",
      daysAgo: 52,
      labels: ["enhancement"],
      state: "archived",
      revisions: [
        {
          description:
            "Adds a `serde` feature with `Serialize`/`Deserialize` for `Signature` and `VerifyingKey`, as hex strings in human-readable formats and raw bytes otherwise.",
          hoursAfter: 0,
          base: "bench-batch",
          commits: [
            {
              message: `Add an optional serde feature`,
              author: "priya",
              daysAgo: 52,
              changes: {
                "src/serde.rs": `use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::{Signature, VerifyingKey};

impl Serialize for VerifyingKey {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bytes(self.as_bytes())
    }
}

impl<'de> Deserialize<'de> for VerifyingKey {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let bytes = <[u8; 32]>::deserialize(deserializer)?;
        VerifyingKey::from_bytes(&bytes).map_err(D::Error::custom)
    }
}

impl Serialize for Signature {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bytes(&self.to_bytes())
    }
}
`,
                "src/lib.rs": [
                  ["mod ct;\n", "mod ct;\n#[cfg(feature = \"serde\")]\nmod serde;\n"],
                ],
                "Cargo.toml": [
                  [
                    'rand_core = ["dep:rand_core"]\n',
                    'rand_core = ["dep:rand_core"]\nserde = ["dep:serde"]\n',
                  ],
                  [
                    'sha2 = { version = "0.10", default-features = false }\n',
                    'serde = { version = "1", default-features = false, optional = true }\nsha2 = { version = "0.10", default-features = false }\n',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "zeynep",
              hoursAfter: 30,
              summary:
                "Thanks for the clean patch. I don't think sigil should own this, reasoning below.",
              comments: [
                {
                  body: "This happily deserializes weak keys. In a config file that's probably a mistake the application wants to reject, but sigil can't know that.",
                  path: "src/serde.rs",
                  line: 15,
                },
                {
                  body: "The description says hex for human-readable formats, but this always serializes as bytes, so JSON gets an array of 32 numbers. Which encoding to use is exactly the kind of choice I'd rather leave to applications.",
                  path: "src/serde.rs",
                  line: 8,
                },
              ],
            },
          ],
          comments: [
            {
              author: "priya",
              body: "Oops, I lost the hex part while splitting the commit. But I take the point about weak keys. I'll keep the newtype in my project. Archiving.",
              hoursAfter: 40,
            },
          ],
        },
      ],
    },
    {
      title: "Add PreparedVerifyingKey for repeated verification",
      author: "malik",
      daysAgo: 9,
      labels: ["perf"],
      state: "draft",
      revisions: [
        {
          description:
            "Draft, not ready for review. A `PreparedVerifyingKey` that checks canonicity and small order once, and keeps a precomputed table for `[k]A`. With alloc it brings verify_strict from 42 µs to 29 µs for a key used more than ~20 times. Without alloc it only caches the two checks (see the perf issue).",
          hoursAfter: 0,
          base: "malleability",
          commits: [
            {
              message: `WIP: add PreparedVerifyingKey

Caches the canonical-encoding and small-order checks. The precomputed
table part is still behind a TODO while I figure out the memory cost
on no-alloc targets.`,
              author: "malik",
              daysAgo: 9,
              changes: {
                "src/prepared.rs": `use crate::{Error, Signature, VerifyingKey};

/// A public key with its validity checks done up front.
///
/// Build one when you'll verify many signatures under the same key, e.g. a
/// long-lived peer. Verification results are identical to
/// [\`VerifyingKey::verify_strict\`].
#[derive(Clone, Copy, Debug)]
pub struct PreparedVerifyingKey {
    key: VerifyingKey,
    acceptable: Result<(), Error>,
}

impl PreparedVerifyingKey {
    /// Run the per-key checks once.
    pub fn new(key: VerifyingKey) -> Self {
        let acceptable = key.check_strict();
        Self { key, acceptable }
    }

    /// Same as [\`VerifyingKey::verify_strict\`], minus the per-key checks.
    pub fn verify_strict(&self, message: &[u8], signature: &Signature) -> Result<(), Error> {
        self.acceptable?;
        // TODO: use a VartimeEdwardsPrecomputation for A when alloc is on.
        self.key.verify_strict_unchecked(message, signature)
    }
}
`,
                "src/lib.rs": [
                  ["mod error;\n", "mod error;\nmod prepared;\n"],
                  [
                    "pub use error::Error;\n",
                    "pub use error::Error;\npub use prepared::PreparedVerifyingKey;\n",
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "yuki",
              body: "Thanks for picking this up. For what it's worth, the 20-use break-even is way below what our relays see: most peer keys get hundreds of announcements per session.",
              hoursAfter: 20,
            },
            {
              author: "malik",
              body: "Good to know. The table is ~30 KiB per key with dalek's default window, which is fine on a relay and not fine on a Cortex-M4 with 64 KiB of RAM. Probably two types, or a const generic. Thinking.",
              hoursAfter: 23,
              replyTo: 0,
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "v0.1.0",
      at: "v0.1.0",
      title: "sigil 0.1.0",
      notes: `First release.

- Ed25519 signing and two verification rules: \`verify_strict\` (recommended) and \`verify\` (cofactored). \`docs/verification.md\` explains when to use which.
- Secret key material is zeroized on drop; \`Debug\` never prints it.
- \`no_std\`, no \`unsafe\`, no allocation. CI builds for \`thumbv7em-none-eabihf\`.

An independent review of this release by Keystone is in the audits repository.`,
      author: "zeynep",
      daysAgo: 262,
      artifacts: [
        { name: "sigil-0.1.0.crate", sizeBytes: 18_412 },
        { name: "sigil-0.1.0.crate.sig", sizeBytes: 119 },
      ],
    },
    {
      tag: "v0.2.0",
      at: "v0.2.0",
      title: "sigil 0.2.0",
      notes: `**Security fix:** \`verify_strict\` now rejects non-canonical encodings of the public key. Before, a key had two valid encodings for 19 special values of y, and both verified. Please upgrade if you use public key bytes as identifiers. Thanks to theo for finding this with a differential fuzzer.

Also new:

- \`batch\` feature with \`batch::verify_batch\` (cofactored rule, about 2x faster per signature for batches of 64)
- The per-signature nonce is zeroized after signing (reported in the issue tracker, thank you)
- \`TryFrom<&[u8]>\` for \`Signature\` and \`VerifyingKey\`
- Fuzz targets and criterion benchmarks`,
      author: "zeynep",
      daysAgo: 139,
      artifacts: [
        { name: "sigil-0.2.0.crate", sizeBytes: 24_906 },
        { name: "sigil-0.2.0.crate.sig", sizeBytes: 119 },
      ],
    },
    {
      tag: "v0.3.0",
      at: "v0.3.0",
      title: "sigil 0.3.0",
      notes: `Two small breaking changes, then hopefully a quiet stretch until 1.0.

- \`Error\` is \`#[non_exhaustive]\`. If you match on it, add a wildcard arm (and consider not matching on it at all).
- MSRV is now Rust 1.70.

Added \`SigningKey::generate\` behind the \`rand_core\` feature, batch benchmarks, and an early return for empty batches. CI now runs every fuzz target on each change.

The audit of the batch verification code is published in the audits repository as part of the 0.3 review.`,
      author: "zeynep",
      daysAgo: 20,
      artifacts: [
        { name: "sigil-0.3.0.crate", sizeBytes: 26_331 },
        { name: "sigil-0.3.0.crate.sig", sizeBytes: 119 },
        { name: "SHA256SUMS", sizeBytes: 162 },
      ],
    },
  ],
};
