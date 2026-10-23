import type { RepoSeed } from "./types";

const readme = `# meshd

A small routing daemon for community mesh networks. It speaks a Babel-like
distance-vector protocol over IPv6 link-local multicast, measures every
WiFi link with ETX, and installs the routes it picks into the kernel.

meshd is written for the rooftop routers of a few community networks: cheap
MIPS and ARM boxes with 8 MB of flash, flaky links and nobody on call. It
aims to be small, boring and easy to read, not to implement every RFC.

## Building

    cargo build --release

The release profile is tuned for size. A stripped mipsel binary is a bit
over 1 MB.

## Running

    meshd /etc/meshd.toml

See \`meshd.example.toml\` for every option. meshd needs \`CAP_NET_ADMIN\` to
install routes; the systemd unit in \`contrib/\` grants exactly that.

Logging goes through \`RUST_LOG\`, e.g. \`RUST_LOG=meshd=debug\`.

## Status

Running on about forty routers across three networks. The wire format is
not stable yet: all routers in a mesh should run the same minor version.
`;

const license = `meshd is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. See https://www.gnu.org/licenses/gpl-3.0.txt for the full text.
`;

const gitignore = `/target
*.swp
/meshd.toml
`;

const cargoToml = `[package]
name = "meshd"
version = "0.0.1"
edition = "2021"
description = "A small distance-vector routing daemon for community mesh networks"
license = "GPL-3.0-or-later"
repository = "https://meshwork.example.net/meshd"
rust-version = "1.74"

[dependencies]
anyhow = "1"
env_logger = "0.11"
libc = "0.2"
log = "0.4"
serde = { version = "1", features = ["derive"] }
toml = "0.8"

[profile.release]
lto = true
opt-level = "s"
codegen-units = 1
panic = "abort"
strip = true
`;

const mainRs = String.raw`mod config;
mod kernel;
mod packet;
mod route;

use std::net::{Ipv6Addr, SocketAddrV6, UdpSocket};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use log::{debug, info, warn};

use crate::config::Config;
use crate::packet::Packet;
use crate::route::RouteTable;

const PORT: u16 = 6696;
const MULTICAST: Ipv6Addr = Ipv6Addr::new(0xff02, 0, 0, 0, 0, 0, 1, 6);

fn main() -> Result<()> {
    env_logger::init();
    let path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/etc/meshd.toml"));
    let config = Config::load(&path).with_context(|| format!("reading {}", path.display()))?;
    info!("meshd {} starting as {:016x}", env!("CARGO_PKG_VERSION"), config.router_id);

    let socket = UdpSocket::bind(SocketAddrV6::new(Ipv6Addr::UNSPECIFIED, PORT, 0, 0))?;
    let mut ifindexes = Vec::new();
    for iface in &config.interfaces {
        let index = iface.index()?;
        socket.join_multicast_v6(&MULTICAST, index)?;
        ifindexes.push((iface.name.as_str(), index));
    }
    socket.set_read_timeout(Some(Duration::from_millis(250)))?;

    let mut table = RouteTable::new(config.router_id);
    let mut seqno: u16 = 0;
    let mut next_hello = Instant::now();
    let mut buf = [0u8; 1500];

    loop {
        let now = Instant::now();
        if now >= next_hello {
            seqno = seqno.wrapping_add(1);
            send_all(&socket, &ifindexes, &Packet::hello(config.router_id, seqno));
            next_hello = now + config.hello_interval();
        }

        match socket.recv_from(&mut buf) {
            Ok((len, from)) => match Packet::decode(&buf[..len]) {
                Ok(packet) => table.handle(packet, from),
                Err(e) => debug!("dropping packet from {from}: {e}"),
            },
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(e) => return Err(e.into()),
        }

        table.expire(Instant::now());
        sync_kernel(&mut table);
    }
}

fn send_all(socket: &UdpSocket, ifindexes: &[(&str, u32)], packet: &Packet) {
    let bytes = packet.encode();
    for (name, index) in ifindexes {
        let dst = SocketAddrV6::new(MULTICAST, PORT, 0, *index);
        if let Err(e) = socket.send_to(&bytes, dst) {
            warn!("send on {name}: {e}");
        }
    }
}

fn sync_kernel(table: &mut RouteTable) {
    for (prefix, route) in table.take_changes() {
        let result = match route {
            Some(r) => kernel::install(&prefix, &r.next_hop, r.metric),
            None => kernel::remove(&prefix),
        };
        if let Err(e) = result {
            warn!("kernel route {prefix}: {e}");
        }
    }
}
`;

const mainRsNeighbours = String.raw`use std::net::{Ipv6Addr, SocketAddrV6, UdpSocket};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use log::{debug, info, warn};

use meshd::config::Config;
use meshd::kernel;
use meshd::neighbour::Neighbours;
use meshd::packet::{Packet, Tlv};
use meshd::route::{RouteTable, INFINITY};

const PORT: u16 = 6696;
const MULTICAST: Ipv6Addr = Ipv6Addr::new(0xff02, 0, 0, 0, 0, 0, 1, 6);

fn main() -> Result<()> {
    env_logger::init();
    let path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/etc/meshd.toml"));
    let config = Config::load(&path).with_context(|| format!("reading {}", path.display()))?;
    info!("meshd {} starting as {:016x}", env!("CARGO_PKG_VERSION"), config.router_id);

    let socket = UdpSocket::bind(SocketAddrV6::new(Ipv6Addr::UNSPECIFIED, PORT, 0, 0))?;
    let mut ifindexes = Vec::new();
    for iface in &config.interfaces {
        let index = iface.index()?;
        socket.join_multicast_v6(&MULTICAST, index)?;
        ifindexes.push((iface.name.as_str(), index));
    }
    socket.set_read_timeout(Some(Duration::from_millis(250)))?;

    let mut table = RouteTable::new(config.router_id);
    let mut neighbours = Neighbours::default();
    let mut seqno: u16 = 0;
    let mut next_hello = Instant::now();
    let mut buf = [0u8; 1500];

    loop {
        let now = Instant::now();
        if now >= next_hello {
            seqno = seqno.wrapping_add(1);
            neighbours.tick(now);
            send_all(&socket, &ifindexes, &Packet::hello(config.router_id, seqno));
            next_hello = now + config.hello_interval();
        }

        match socket.recv_from(&mut buf) {
            Ok((len, from)) => match Packet::decode(&buf[..len]) {
                Ok(packet) => {
                    for tlv in &packet.tlvs {
                        if let Tlv::Hello { seqno, interval_cs } = tlv {
                            let interval = Duration::from_millis(u64::from(*interval_cs) * 10);
                            neighbours.hello(from, packet.sender, *seqno, interval);
                        }
                    }
                    let cost = neighbours.cost(&from).unwrap_or(INFINITY);
                    table.handle(packet, from, cost);
                }
                Err(e) => debug!("dropping packet from {from}: {e}"),
            },
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(e) => return Err(e.into()),
        }

        table.expire(Instant::now());
        sync_kernel(&mut table);
    }
}

fn send_all(socket: &UdpSocket, ifindexes: &[(&str, u32)], packet: &Packet) {
    let bytes = packet.encode();
    for (name, index) in ifindexes {
        let dst = SocketAddrV6::new(MULTICAST, PORT, 0, *index);
        if let Err(e) = socket.send_to(&bytes, dst) {
            warn!("send on {name}: {e}");
        }
    }
}

fn sync_kernel(table: &mut RouteTable) {
    for (prefix, route) in table.take_changes() {
        let result = match route {
            Some(r) => kernel::install(&prefix, &r.next_hop, r.metric),
            None => kernel::remove(&prefix),
        };
        if let Err(e) = result {
            warn!("kernel route {prefix}: {e}");
        }
    }
}
`;

const configRs = String.raw`use std::path::Path;
use std::time::Duration;

use anyhow::{bail, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Config {
    /// Unique within the mesh. Usually derived from a MAC address.
    pub router_id: u64,
    #[serde(default = "default_hello_interval")]
    pub hello_interval_ms: u64,
    pub interfaces: Vec<Interface>,
}

#[derive(Debug, Deserialize)]
pub struct Interface {
    pub name: String,
}

fn default_hello_interval() -> u64 {
    4000
}

impl Config {
    pub fn load(path: &Path) -> Result<Config> {
        let text = std::fs::read_to_string(path)?;
        let config: Config = toml::from_str(&text)?;
        if config.interfaces.is_empty() {
            bail!("no interfaces configured");
        }
        if config.hello_interval_ms < 500 {
            bail!("hello_interval_ms must be at least 500");
        }
        Ok(config)
    }

    pub fn hello_interval(&self) -> Duration {
        Duration::from_millis(self.hello_interval_ms)
    }
}

impl Interface {
    pub fn index(&self) -> Result<u32> {
        let name = std::ffi::CString::new(self.name.as_str())?;
        let index = unsafe { libc::if_nametoindex(name.as_ptr()) };
        if index == 0 {
            bail!("no such interface: {}", self.name);
        }
        Ok(index)
    }
}
`;

const packetRs = String.raw`//! Wire format: a 12-byte header followed by TLVs. Loosely modelled on Babel
//! (RFC 8966), without the parts a small mesh doesn't need.

use anyhow::{bail, ensure, Result};

pub const MAGIC: u8 = 42;
pub const VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq)]
pub enum Tlv {
    Hello { seqno: u16, interval_cs: u16 },
    Update { prefix: [u8; 16], plen: u8, seqno: u16, metric: u16, router_id: u64 },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Packet {
    pub sender: u64,
    pub tlvs: Vec<Tlv>,
}

impl Packet {
    pub fn hello(sender: u64, seqno: u16) -> Packet {
        Packet { sender, tlvs: vec![Tlv::Hello { seqno, interval_cs: 400 }] }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut out = vec![MAGIC, VERSION, 0, 0];
        out.extend_from_slice(&self.sender.to_be_bytes());
        for tlv in &self.tlvs {
            match tlv {
                Tlv::Hello { seqno, interval_cs } => {
                    out.extend_from_slice(&[4, 4]);
                    out.extend_from_slice(&seqno.to_be_bytes());
                    out.extend_from_slice(&interval_cs.to_be_bytes());
                }
                Tlv::Update { prefix, plen, seqno, metric, router_id } => {
                    out.extend_from_slice(&[8, 29, *plen]);
                    out.extend_from_slice(prefix);
                    out.extend_from_slice(&seqno.to_be_bytes());
                    out.extend_from_slice(&metric.to_be_bytes());
                    out.extend_from_slice(&router_id.to_be_bytes());
                }
            }
        }
        let body = (out.len() - 4) as u16;
        out[2..4].copy_from_slice(&body.to_be_bytes());
        out
    }

    pub fn decode(buf: &[u8]) -> Result<Packet> {
        ensure!(buf.len() >= 12, "short packet ({} bytes)", buf.len());
        ensure!(buf[0] == MAGIC, "bad magic {}", buf[0]);
        ensure!(buf[1] == VERSION, "unsupported version {}", buf[1]);
        let body = u16::from_be_bytes([buf[2], buf[3]]) as usize;
        ensure!(body >= 8 && buf.len() >= 4 + body, "truncated packet");
        let sender = u64::from_be_bytes(buf[4..12].try_into()?);
        let mut tlvs = Vec::new();
        let mut rest = &buf[12..4 + body];
        while !rest.is_empty() {
            ensure!(rest.len() >= 2, "truncated TLV header");
            let (kind, len) = (rest[0], rest[1] as usize);
            ensure!(rest.len() >= 2 + len, "TLV {kind} overruns packet");
            let v = &rest[2..2 + len];
            match kind {
                4 if len == 4 => tlvs.push(Tlv::Hello {
                    seqno: u16::from_be_bytes([v[0], v[1]]),
                    interval_cs: u16::from_be_bytes([v[2], v[3]]),
                }),
                8 if len == 29 => tlvs.push(Tlv::Update {
                    plen: v[0],
                    prefix: v[1..17].try_into()?,
                    seqno: u16::from_be_bytes([v[17], v[18]]),
                    metric: u16::from_be_bytes([v[19], v[20]]),
                    router_id: u64::from_be_bytes(v[21..29].try_into()?),
                }),
                4 | 8 => bail!("TLV {kind} has wrong length {len}"),
                // Unknown TLVs are skipped so newer routers can add them.
                _ => {}
            }
            rest = &rest[2 + len..];
        }
        Ok(Packet { sender, tlvs })
    }
}
`;

const routeRs = String.raw`//! The routing table: routes learned from neighbours, and the feasibility
//! condition that keeps distance-vector routing loop-free.

use std::collections::HashMap;
use std::fmt;
use std::net::{Ipv6Addr, SocketAddr};
use std::time::{Duration, Instant};

use log::debug;

use crate::packet::{Packet, Tlv};

pub const INFINITY: u16 = 0xFFFF;
const ROUTE_EXPIRY: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Prefix {
    pub addr: [u8; 16],
    pub len: u8,
}

impl fmt::Display for Prefix {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}/{}", Ipv6Addr::from(self.addr), self.len)
    }
}

#[derive(Debug, Clone)]
pub struct Route {
    pub prefix: Prefix,
    pub router_id: u64,
    pub next_hop: SocketAddr,
    pub seqno: u16,
    pub metric: u16,
    pub updated: Instant,
}

#[derive(Debug, Clone, Copy)]
struct Source {
    seqno: u16,
    metric: u16,
}

pub struct RouteTable {
    router_id: u64,
    seqno: u16,
    routes: HashMap<Prefix, Route>,
    sources: HashMap<(Prefix, u64), Source>,
    changed: Vec<Prefix>,
}

impl RouteTable {
    pub fn new(router_id: u64) -> RouteTable {
        RouteTable {
            router_id,
            seqno: 0,
            routes: HashMap::new(),
            sources: HashMap::new(),
            changed: Vec::new(),
        }
    }

    pub fn seqno(&self) -> u16 {
        self.seqno
    }

    pub fn routes(&self) -> impl Iterator<Item = &Route> {
        self.routes.values()
    }

    pub fn handle(&mut self, packet: Packet, from: SocketAddr) {
        for tlv in packet.tlvs {
            if let Tlv::Update { prefix, plen, seqno, metric, router_id } = tlv {
                let prefix = Prefix { addr: prefix, len: plen };
                self.update(prefix, router_id, from, seqno, metric.saturating_add(256));
            }
        }
    }

    /// Babel's feasibility condition (RFC 8966, 3.5.1): an update is feasible
    /// if its seqno is newer than the one we have from that source, or the
    /// same seqno with a strictly smaller metric.
    fn feasible(&self, prefix: Prefix, router_id: u64, seqno: u16, metric: u16) -> bool {
        if metric == INFINITY {
            return true;
        }
        match self.sources.get(&(prefix, router_id)) {
            None => true,
            Some(s) => seqno_newer(seqno, s.seqno) || (seqno == s.seqno && metric < s.metric),
        }
    }

    fn update(&mut self, prefix: Prefix, router_id: u64, next_hop: SocketAddr, seqno: u16, metric: u16) {
        if router_id == self.router_id || !self.feasible(prefix, router_id, seqno, metric) {
            return;
        }
        let better = match self.routes.get(&prefix) {
            None => true,
            Some(r) => r.next_hop == next_hop || metric < r.metric,
        };
        if better {
            debug!("route {prefix} via {next_hop} metric {metric}");
            self.sources.insert((prefix, router_id), Source { seqno, metric });
            let route = Route { prefix, router_id, next_hop, seqno, metric, updated: Instant::now() };
            self.routes.insert(prefix, route);
            self.changed.push(prefix);
        }
    }

    pub fn expire(&mut self, now: Instant) {
        let changed = &mut self.changed;
        self.routes.retain(|prefix, r| {
            let keep = now.duration_since(r.updated) < ROUTE_EXPIRY;
            if !keep {
                debug!("route {prefix} expired");
                changed.push(*prefix);
            }
            keep
        });
    }

    /// Prefixes whose selected route changed since the last call, with the
    /// new route, or None if the prefix is now unreachable.
    pub fn take_changes(&mut self) -> Vec<(Prefix, Option<Route>)> {
        let mut changed = std::mem::take(&mut self.changed);
        changed.sort_by_key(|p| (p.addr, p.len));
        changed.dedup();
        changed.into_iter().map(|p| (p, self.routes.get(&p).cloned())).collect()
    }
}

/// Sequence number comparison modulo 2^16 (RFC 8966, 3.2.1).
pub fn seqno_newer(a: u16, b: u16) -> bool {
    a != b && a.wrapping_sub(b) < 0x8000
}
`;

const kernelRs = String.raw`//! Install and remove routes in the kernel. Shelling out to ip(8) is slow but
//! obviously correct; netlink can come later if it ever matters.

use std::ffi::CStr;
use std::net::SocketAddr;
use std::process::Command;

use anyhow::{bail, Result};

use crate::route::Prefix;

/// Our routes are tagged with this protocol number so they are easy to find
/// (ip -6 route show proto 42) and never clash with static routes.
const PROTO: &str = "42";

pub fn install(prefix: &Prefix, via: &SocketAddr, metric: u16) -> Result<()> {
    let SocketAddr::V6(via) = via else {
        bail!("IPv4 next hops are not supported");
    };
    let dev = ifname(via.scope_id())?;
    ip(&[
        "-6", "route", "replace", &prefix.to_string(),
        "via", &via.ip().to_string(), "dev", &dev,
        "metric", &metric.to_string(), "proto", PROTO,
    ])
}

pub fn remove(prefix: &Prefix) -> Result<()> {
    ip(&["-6", "route", "del", &prefix.to_string(), "proto", PROTO])
}

fn ifname(index: u32) -> Result<String> {
    let mut buf = [0 as libc::c_char; libc::IF_NAMESIZE];
    let ptr = unsafe { libc::if_indextoname(index, buf.as_mut_ptr()) };
    if ptr.is_null() {
        bail!("no interface with index {index}");
    }
    Ok(unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned())
}

fn ip(args: &[&str]) -> Result<()> {
    let status = Command::new("ip").args(args).status()?;
    if !status.success() {
        bail!("ip {} failed: {status}", args.join(" "));
    }
    Ok(())
}
`;

const exampleToml = `# meshd configuration. Copy to /etc/meshd.toml and adjust.

# A unique 64-bit id for this router. An EUI-64 built from a MAC address
# works well; it only has to be unique within the mesh.
router_id = 0x02a1b2fffec3d4e5

# How often to send hellos, in milliseconds. Neighbours that miss a few in a
# row get a worse link cost.
hello_interval_ms = 4000

# Every interface meshd should run on. Usually the mesh radio, sometimes
# also an ethernet port that links two routers on the same roof.
[[interfaces]]
name = "wlan0"
`;

const systemdUnit = `[Unit]
Description=meshd mesh routing daemon
Documentation=https://meshwork.example.net/meshd
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/meshd /etc/meshd.toml
Restart=on-failure
RestartSec=5
Environment=RUST_LOG=meshd=info

[Install]
WantedBy=multi-user.target
`;

const systemdUnitHardened = `[Unit]
Description=meshd mesh routing daemon
Documentation=https://meshwork.example.net/meshd
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/meshd /etc/meshd.toml
Restart=on-failure
RestartSec=5
Environment=RUST_LOG=meshd=info

# meshd only needs to bind a high UDP port and change routes.
User=meshd
Group=meshd
AmbientCapabilities=CAP_NET_ADMIN
CapabilityBoundingSet=CAP_NET_ADMIN
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
RuntimeDirectory=meshd
RestrictAddressFamilies=AF_INET6 AF_UNIX AF_NETLINK

[Install]
WantedBy=multi-user.target
`;

const libRs = `pub mod config;
pub mod kernel;
pub mod packet;
pub mod route;
`;

const libRsNeighbours = `pub mod config;
pub mod etx;
pub mod kernel;
pub mod neighbour;
pub mod packet;
pub mod route;
`;

const libRsControl = `pub mod config;
pub mod control;
pub mod etx;
pub mod kernel;
pub mod neighbour;
pub mod packet;
pub mod route;
`;

const testsPacket = String.raw`use meshd::packet::{Packet, Tlv};

#[test]
fn hello_round_trips() {
    let p = Packet::hello(0x02a1_b2ff_fec3_d4e5, 7);
    assert_eq!(Packet::decode(&p.encode()).unwrap(), p);
}

#[test]
fn update_round_trips() {
    let p = Packet {
        sender: 9,
        tlvs: vec![Tlv::Update {
            prefix: [0xfd, 0x42, 0x6d, 0x65, 0x73, 0x68, 0, 0x12, 0, 0, 0, 0, 0, 0, 0, 0],
            plen: 64,
            seqno: 0xfffe,
            metric: 512,
            router_id: 9,
        }],
    };
    assert_eq!(Packet::decode(&p.encode()).unwrap(), p);
}

#[test]
fn unknown_tlvs_are_skipped() {
    let mut bytes = Packet::hello(1, 1).encode();
    bytes.extend_from_slice(&[99, 3, 1, 2, 3]);
    let body = (bytes.len() - 4) as u16;
    bytes[2..4].copy_from_slice(&body.to_be_bytes());
    assert_eq!(Packet::decode(&bytes).unwrap().tlvs.len(), 1);
}

#[test]
fn truncated_packet_is_rejected() {
    let bytes = Packet::hello(1, 1).encode();
    assert!(Packet::decode(&bytes[..bytes.len() - 2]).is_err());
}
`;

const testsPacketInterval = String.raw`use std::time::Duration;

use meshd::packet::{Packet, Tlv};

const FOUR_SECONDS: Duration = Duration::from_secs(4);

#[test]
fn hello_round_trips() {
    let p = Packet::hello(0x02a1_b2ff_fec3_d4e5, 7, FOUR_SECONDS);
    assert_eq!(Packet::decode(&p.encode()).unwrap(), p);
}

#[test]
fn hello_carries_interval_in_centiseconds() {
    let p = Packet::hello(1, 1, Duration::from_millis(2500));
    assert_eq!(p.tlvs, vec![Tlv::Hello { seqno: 1, interval_cs: 250 }]);
}

#[test]
fn update_round_trips() {
    let p = Packet {
        sender: 9,
        tlvs: vec![Tlv::Update {
            prefix: [0xfd, 0x42, 0x6d, 0x65, 0x73, 0x68, 0, 0x12, 0, 0, 0, 0, 0, 0, 0, 0],
            plen: 64,
            seqno: 0xfffe,
            metric: 512,
            router_id: 9,
        }],
    };
    assert_eq!(Packet::decode(&p.encode()).unwrap(), p);
}

#[test]
fn unknown_tlvs_are_skipped() {
    let mut bytes = Packet::hello(1, 1, FOUR_SECONDS).encode();
    bytes.extend_from_slice(&[99, 3, 1, 2, 3]);
    let body = (bytes.len() - 4) as u16;
    bytes[2..4].copy_from_slice(&body.to_be_bytes());
    assert_eq!(Packet::decode(&bytes).unwrap().tlvs.len(), 1);
}

#[test]
fn truncated_packet_is_rejected() {
    let bytes = Packet::hello(1, 1, FOUR_SECONDS).encode();
    assert!(Packet::decode(&bytes[..bytes.len() - 2]).is_err());
}
`;

const etxRs = String.raw`//! Expected transmission count (ETX), estimated from hello loss.
//!
//! Every neighbour sends a hello each interval. We keep a 16-bit history of
//! which hellos arrived and take the delivery ratio from it. Proper ETX is
//! 1 / (df * dr); we have no reverse measurement yet, so we assume the link
//! is symmetric and use 256 / df^2.

pub const MAX_COST: u16 = 0xFFFF;

#[derive(Debug, Clone, Default)]
pub struct Etx {
    history: u16,
    last_seqno: Option<u16>,
}

impl Etx {
    /// Record a hello with the given seqno. Seqnos skipped since the last
    /// one count as lost hellos.
    pub fn hello(&mut self, seqno: u16) {
        let gap = match self.last_seqno {
            Some(last) => seqno.wrapping_sub(last).min(16),
            None => 1,
        };
        if gap == 0 {
            return;
        }
        self.history = self.history.checked_shl(u32::from(gap)).unwrap_or(0) | 1;
        self.last_seqno = Some(seqno);
    }

    /// Record a hello interval that passed without hearing anything.
    pub fn missed(&mut self) {
        self.history <<= 1;
        if let Some(last) = self.last_seqno.as_mut() {
            *last = last.wrapping_add(1);
        }
    }

    /// Fraction of the last 16 hellos that arrived.
    pub fn delivery_ratio(&self) -> f32 {
        self.history.count_ones() as f32 / 16.0
    }

    /// Link cost in Babel units, where 256 is a perfect link.
    pub fn cost(&self) -> u16 {
        let df = self.delivery_ratio();
        if df < 0.1 {
            return MAX_COST;
        }
        (256.0 / (df * df)).min(MAX_COST as f32 - 1.0) as u16
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perfect_link_costs_256() {
        let mut e = Etx::default();
        for s in 0..16 {
            e.hello(s);
        }
        assert_eq!(e.cost(), 256);
    }

    #[test]
    fn half_lost_link_costs_four_times_more() {
        let mut e = Etx::default();
        for s in (0..32).step_by(2) {
            e.hello(s);
        }
        assert_eq!(e.cost(), 1024);
    }

    #[test]
    fn silent_neighbour_is_unreachable() {
        let mut e = Etx::default();
        e.hello(0);
        for _ in 0..16 {
            e.missed();
        }
        assert_eq!(e.cost(), MAX_COST);
    }
}
`;

const etxRsEwmaR1 = String.raw`//! Expected transmission count (ETX), estimated from hello loss.
//!
//! Every neighbour sends a hello each interval. We keep a 16-bit history of
//! which hellos arrived and take the delivery ratio from it. Proper ETX is
//! 1 / (df * dr); we have no reverse measurement yet, so we assume the link
//! is symmetric and use 256 / df^2.
//!
//! The raw cost jumps by a lot whenever a single hello is lost, so the cost
//! we hand out is an exponentially weighted moving average of it.

pub const MAX_COST: u16 = 0xFFFF;

/// Weight of each new sample. 0.25 settles within about ten hellos.
const ALPHA: f32 = 0.25;

#[derive(Debug, Clone, Default)]
pub struct Etx {
    history: u16,
    last_seqno: Option<u16>,
    smoothed: Option<f32>,
}

impl Etx {
    /// Record a hello with the given seqno. Seqnos skipped since the last
    /// one count as lost hellos.
    pub fn hello(&mut self, seqno: u16) {
        let gap = match self.last_seqno {
            Some(last) => seqno.wrapping_sub(last).min(16),
            None => 1,
        };
        if gap == 0 {
            return;
        }
        self.history = self.history.checked_shl(u32::from(gap)).unwrap_or(0) | 1;
        self.last_seqno = Some(seqno);
        self.sample();
    }

    /// Record a hello interval that passed without hearing anything.
    pub fn missed(&mut self) {
        self.history <<= 1;
        if let Some(last) = self.last_seqno.as_mut() {
            *last = last.wrapping_add(1);
        }
        self.sample();
    }

    /// Fraction of the last 16 hellos that arrived.
    pub fn delivery_ratio(&self) -> f32 {
        self.history.count_ones() as f32 / 16.0
    }

    /// Smoothed link cost in Babel units, where 256 is a perfect link.
    pub fn cost(&self) -> u16 {
        match self.smoothed {
            Some(s) if s < MAX_COST as f32 => s as u16,
            _ => MAX_COST,
        }
    }

    fn raw_cost(&self) -> f32 {
        let df = self.delivery_ratio();
        if df < 0.1 {
            return MAX_COST as f32;
        }
        (256.0 / (df * df)).min(MAX_COST as f32 - 1.0)
    }

    fn sample(&mut self) {
        let raw = self.raw_cost();
        self.smoothed = Some(match self.smoothed {
            Some(s) => s + ALPHA * (raw - s),
            None => raw,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perfect_link_costs_256() {
        let mut e = Etx::default();
        for s in 0..64 {
            e.hello(s);
        }
        assert!((256..=260).contains(&e.cost()));
    }

    #[test]
    fn half_lost_link_costs_four_times_more() {
        let mut e = Etx::default();
        for s in (0..128).step_by(2) {
            e.hello(s);
        }
        assert!((1024..=1040).contains(&e.cost()));
    }

    #[test]
    fn silent_neighbour_is_unreachable() {
        let mut e = Etx::default();
        e.hello(0);
        for _ in 0..16 {
            e.missed();
        }
        assert_eq!(e.cost(), MAX_COST);
    }
}
`;

const etxRsEwma = String.raw`//! Expected transmission count (ETX), estimated from hello loss.
//!
//! Every neighbour sends a hello each interval. We keep a 16-bit history of
//! which hellos arrived and take the delivery ratio from it. Proper ETX is
//! 1 / (df * dr); we have no reverse measurement yet, so we assume the link
//! is symmetric and use 256 / df^2.
//!
//! The raw cost jumps by a lot whenever a single hello is lost, so the cost
//! we hand out is an exponentially weighted moving average of it.

pub const MAX_COST: u16 = 0xFFFF;

/// Weight of each new sample. 0.25 settles within about ten hellos.
const ALPHA: f32 = 0.25;

#[derive(Debug, Clone, Default)]
pub struct Etx {
    history: u16,
    last_seqno: Option<u16>,
    smoothed: Option<f32>,
}

impl Etx {
    /// Record a hello with the given seqno. Seqnos skipped since the last
    /// one count as lost hellos.
    pub fn hello(&mut self, seqno: u16) {
        let gap = match self.last_seqno {
            Some(last) => seqno.wrapping_sub(last).min(16),
            None => 1,
        };
        if gap == 0 {
            return;
        }
        self.history = self.history.checked_shl(u32::from(gap)).unwrap_or(0) | 1;
        self.last_seqno = Some(seqno);
        self.sample();
    }

    /// Record a hello interval that passed without hearing anything.
    pub fn missed(&mut self) {
        self.history <<= 1;
        if let Some(last) = self.last_seqno.as_mut() {
            *last = last.wrapping_add(1);
        }
        self.sample();
    }

    /// Fraction of the last 16 hellos that arrived.
    pub fn delivery_ratio(&self) -> f32 {
        self.history.count_ones() as f32 / 16.0
    }

    /// Smoothed link cost in Babel units, where 256 is a perfect link.
    pub fn cost(&self) -> u16 {
        match self.smoothed {
            Some(s) if s < MAX_COST as f32 => s as u16,
            _ => MAX_COST,
        }
    }

    fn raw_cost(&self) -> f32 {
        let df = self.delivery_ratio();
        if df < 0.1 {
            return MAX_COST as f32;
        }
        (256.0 / (df * df)).min(MAX_COST as f32 - 1.0)
    }

    fn sample(&mut self) {
        let raw = self.raw_cost();
        let unreachable = MAX_COST as f32;
        // Becoming reachable or unreachable is news, not noise: take it at
        // once instead of averaging our way there over a minute.
        self.smoothed = Some(match self.smoothed {
            Some(s) if s < unreachable && raw < unreachable => s + ALPHA * (raw - s),
            _ => raw,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perfect_link_costs_256() {
        let mut e = Etx::default();
        for s in 0..64 {
            e.hello(s);
        }
        assert!((256..=260).contains(&e.cost()));
    }

    #[test]
    fn half_lost_link_costs_four_times_more() {
        let mut e = Etx::default();
        for s in (0..128).step_by(2) {
            e.hello(s);
        }
        assert!((1024..=1040).contains(&e.cost()));
    }

    #[test]
    fn one_lost_hello_barely_moves_the_cost() {
        let mut e = Etx::default();
        for s in 0..64 {
            e.hello(s);
        }
        e.hello(65);
        assert!(e.cost() < 320, "cost jumped to {}", e.cost());
    }

    #[test]
    fn silent_neighbour_is_unreachable_at_once() {
        let mut e = Etx::default();
        for s in 0..64 {
            e.hello(s);
        }
        for _ in 0..16 {
            e.missed();
        }
        assert_eq!(e.cost(), MAX_COST);
    }
}
`;

const neighbourRs = String.raw`//! Neighbours we have heard hellos from, and the cost of the link to each.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use log::info;

use crate::etx::Etx;

#[derive(Debug)]
pub struct Neighbour {
    pub addr: SocketAddr,
    pub router_id: u64,
    pub etx: Etx,
    pub last_hello: Instant,
    pub interval: Duration,
}

#[derive(Debug, Default)]
pub struct Neighbours {
    by_addr: HashMap<SocketAddr, Neighbour>,
}

impl Neighbours {
    pub fn hello(&mut self, addr: SocketAddr, router_id: u64, seqno: u16, interval: Duration) {
        let n = self.by_addr.entry(addr).or_insert_with(|| {
            info!("new neighbour {router_id:016x} at {addr}");
            Neighbour { addr, router_id, etx: Etx::default(), last_hello: Instant::now(), interval }
        });
        n.etx.hello(seqno);
        n.last_hello = Instant::now();
        n.interval = interval;
    }

    /// Called once per hello interval: count a missed hello for every
    /// neighbour we haven't heard from in time.
    pub fn tick(&mut self, now: Instant) {
        for n in self.by_addr.values_mut() {
            if now.duration_since(n.last_hello) > n.interval + n.interval / 2 {
                n.etx.missed();
            }
        }
    }

    pub fn cost(&self, addr: &SocketAddr) -> Option<u16> {
        self.by_addr.get(addr).map(|n| n.etx.cost())
    }

    pub fn iter(&self) -> impl Iterator<Item = &Neighbour> {
        self.by_addr.values()
    }
}
`;

const controlRs = String.raw`//! A Unix socket that answers one command per connection with one line of
//! JSON, for meshctl and the map bridge. See docs/control-protocol.md.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use std::time::Duration;

use anyhow::Result;
use log::warn;
use serde::Serialize;
use serde_json::json;

use crate::route::RouteTable;

pub struct Control {
    listener: UnixListener,
}

#[derive(Serialize)]
struct RouteInfo {
    prefix: String,
    router_id: String,
    next_hop: String,
    metric: u16,
    seqno: u16,
}

impl Control {
    pub fn bind(path: &Path) -> Result<Control> {
        let _ = std::fs::remove_file(path);
        let listener = UnixListener::bind(path)?;
        listener.set_nonblocking(true)?;
        Ok(Control { listener })
    }

    /// Answer every client that is waiting. This runs on the main loop, so
    /// a client gets 200ms to send its command before we give up on it.
    pub fn poll(&self, table: &RouteTable) {
        while let Ok((stream, _)) = self.listener.accept() {
            if let Err(e) = serve(stream, table) {
                warn!("control client: {e}");
            }
        }
    }
}

fn serve(stream: UnixStream, table: &RouteTable) -> Result<()> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_millis(200)))?;
    let mut line = String::new();
    BufReader::new(&stream).read_line(&mut line)?;
    let reply = match line.trim() {
        "routes" => json!({ "routes": routes(table) }),
        "version" => json!({ "version": env!("CARGO_PKG_VERSION") }),
        other => json!({ "error": format!("unknown command {other:?}") }),
    };
    let mut stream = stream;
    serde_json::to_writer(&mut stream, &reply)?;
    stream.write_all(b"\n")?;
    Ok(())
}

fn routes(table: &RouteTable) -> Vec<RouteInfo> {
    table
        .routes()
        .map(|r| RouteInfo {
            prefix: r.prefix.to_string(),
            router_id: format!("{:016x}", r.router_id),
            next_hop: r.next_hop.to_string(),
            metric: r.metric,
            seqno: r.seqno,
        })
        .collect()
}
`;

const controlDocs = `# Control protocol

meshd listens on a Unix socket, \`/run/meshd.sock\` unless \`control_socket\`
says otherwise. A client connects, sends one command and a newline, and gets
one line of JSON back before meshd closes the connection.

    $ echo routes | socat - UNIX-CONNECT:/run/meshd.sock
    {"routes":[{"prefix":"fd42:6d65:7368:7::/64","router_id":"02a1b2fffec3d4e5",...}]}

The socket is answered from the routing loop, so keep requests rare (once a
second is plenty) and send the command straight away: meshd waits at most
200ms for it.

## Commands

### \`version\`

    {"version":"0.2.0"}

### \`routes\`

Every selected route.

| Field | Type | Meaning |
|---|---|---|
| \`prefix\` | string | IPv6 prefix as \`addr/len\` |
| \`router_id\` | string | 16 hex digits: the router that announced the prefix |
| \`next_hop\` | string | link-local address of the neighbour, with scope and port |
| \`metric\` | number | total cost; 256 is one perfect hop |
| \`seqno\` | number | the originator's sequence number |

Unknown commands return \`{"error": "..."}\`.
`;

const changelog010 = `# Changelog

## 0.1.0

First release that routes real traffic: it has been running on the six
Cerro Verde rooftops for three weeks without anyone having to climb up.

- Babel-style distance-vector routing with the feasibility condition
- Link cost from ETX, measured from hello loss
- Local prefixes announced from the config file
- Selected routes installed into the kernel with ip(8), tagged proto 42
`;

const routeTests = String.raw`use std::net::{IpAddr, Ipv6Addr, SocketAddr};

use meshd::packet::{Packet, Tlv};
use meshd::route::{seqno_newer, Prefix, RouteTable, INFINITY};

fn update(prefix: &str, router_id: u64, seqno: u16, metric: u16) -> Packet {
    let prefix: Prefix = prefix.parse().unwrap();
    Packet {
        sender: router_id,
        tlvs: vec![Tlv::Update { prefix: prefix.addr, plen: prefix.len, seqno, metric, router_id }],
    }
}

fn peer(n: u16) -> SocketAddr {
    SocketAddr::new(IpAddr::V6(Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, n)), 6696)
}

#[test]
fn first_update_is_accepted() {
    let mut t = RouteTable::new(1);
    t.handle(update("fd00:1::/64", 7, 10, 256), peer(1), 256);
    assert_eq!(t.routes().next().unwrap().metric, 512);
}

#[test]
fn same_seqno_with_worse_metric_is_not_feasible() {
    let mut t = RouteTable::new(1);
    t.handle(update("fd00:1::/64", 7, 10, 256), peer(1), 256);
    t.handle(update("fd00:1::/64", 7, 10, 768), peer(2), 256);
    assert_eq!(t.routes().next().unwrap().next_hop, peer(1));
}

#[test]
fn newer_seqno_is_feasible_even_if_worse() {
    let mut t = RouteTable::new(1);
    t.handle(update("fd00:1::/64", 7, 10, 256), peer(1), 256);
    t.handle(update("fd00:1::/64", 7, 11, 768), peer(1), 256);
    assert_eq!(t.routes().next().unwrap().metric, 1024);
}

#[test]
fn retraction_removes_the_route() {
    let mut t = RouteTable::new(1);
    t.handle(update("fd00:1::/64", 7, 10, 256), peer(1), 256);
    t.handle(update("fd00:1::/64", 7, 10, INFINITY), peer(1), 256);
    assert!(t.routes().next().is_none());
    let changes = t.take_changes();
    assert_eq!(changes.len(), 1);
    assert!(changes[0].1.is_none());
}

#[test]
fn our_own_prefixes_are_ignored() {
    let mut t = RouteTable::new(7);
    t.handle(update("fd00:1::/64", 7, 10, 256), peer(1), 256);
    assert!(t.routes().next().is_none());
}

#[test]
fn seqno_comparison_wraps() {
    assert!(seqno_newer(0, 0xffff));
    assert!(!seqno_newer(0xffff, 0));
    assert!(!seqno_newer(5, 5));
}
`;

const procdInit = `#!/bin/sh /etc/rc.common
# procd init script for OpenWrt. Install as /etc/init.d/meshd and run
# /etc/init.d/meshd enable.

START=95
STOP=10
USE_PROCD=1

start_service() {
	procd_open_instance
	procd_set_param command /usr/sbin/meshd /etc/meshd.toml
	procd_set_param env RUST_LOG=meshd=info
	procd_set_param respawn 3600 5 0
	procd_set_param stdout 1
	procd_set_param stderr 1
	procd_close_instance
}

reload_service() {
	stop
	start
}
`;

const ipv4Design = `# IPv4 prefixes (design notes, not implemented)

Several networks still hand out IPv4 to clients and NAT at the gateway.
They currently run a static route per rooftop, which is what meshd was
meant to get rid of.

## Wire format

Babel uses an address encoding (AE) byte in each Update: 1 for IPv4, 2 for
IPv6. Our Update TLV has no AE and a fixed 16-byte prefix. Options:

1. New TLV kind 10 for IPv4 updates (prefix is 4 bytes, len 17).
   Old routers skip it as unknown. No version bump.
2. IPv4-mapped IPv6 (::ffff:10.12.0.0/112) inside the existing TLV.
   Zero wire changes, but every old router would happily install
   nonsense IPv6 routes for it.

Leaning towards 1.

## Next hops

IPv4 routes still need an IPv4 next hop for the kernel, and the routers
only talk link-local IPv6 to each other. Linux can do
\`ip route add 10.12.0.0/24 via inet6 fe80::1 dev wlan0\` since 5.2, which
avoids assigning IPv4 addresses to mesh links at all. OpenWrt 23.05 is on
5.15, so this is fine for every router we run.

## Open questions

- Do we need IPv4 default routes (0.0.0.0/0) from gateways, or is that a
  separate feature?
- Feasibility state is keyed by Prefix. Needs a family in the key.
`;

export const meshd: RepoSeed = {
  owner: { org: "meshwork" },
  name: "meshd",
  description:
    "A small routing daemon for community mesh networks: Babel-style distance-vector routing with ETX link costs.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["diego", "felix", "oskar"],
  threshold: 2,
  seeding: 25,
  files: {
    "README.md": readme,
    LICENSE: license,
    ".gitignore": gitignore,
    "Cargo.toml": cargoToml,
    "src/main.rs": mainRs,
    "src/config.rs": configRs,
    "src/packet.rs": packetRs,
    "src/route.rs": routeRs,
    "src/kernel.rs": kernelRs,
  },
  root: {
    label: "root",
    message: `Initial commit

Distance-vector routing with the Babel feasibility condition, a fixed
cost of 256 per hop, and routes installed with ip(8). Enough to route
between the three rooftops on Cerro Verde without static routes.`,
    author: "diego",
    daysAgo: 362,
  },
  history: [
    {
      label: "example-config",
      message: `Add an example config and a systemd unit

Both are what we run on the Cerro Verde routers, minus the router ids.`,
      author: "diego",
      daysAgo: 358,
      changes: {
        "meshd.example.toml": exampleToml,
        "contrib/meshd.service": systemdUnit,
      },
    },
    {
      label: "lib-split",
      message: `Split into a library and a binary

Integration tests in tests/ can only reach a library crate. main.rs
keeps the event loop; everything else moves behind lib.rs.`,
      author: "felix",
      daysAgo: 352,
      changes: {
        "src/lib.rs": libRs,
        "src/main.rs": [
          ["mod config;\nmod kernel;\nmod packet;\nmod route;\n\n", ""],
          [
            "use crate::config::Config;\nuse crate::packet::Packet;\nuse crate::route::RouteTable;\n",
            "use meshd::config::Config;\nuse meshd::kernel;\nuse meshd::packet::Packet;\nuse meshd::route::RouteTable;\n",
          ],
        ],
      },
    },
    {
      label: "packet-tests",
      message: `packet: add round-trip tests

Covers hellos, updates, skipping unknown TLVs and rejecting truncated
packets. The last one would have caught the off-by-two I fixed by hand
on the Cerro Verde router last week.`,
      author: "felix",
      daysAgo: 347,
      changes: {
        "tests/packet.rs": testsPacket,
      },
    },
    {
      label: "etx",
      message: `Track neighbours and cost links by ETX

Every hello now updates a per-neighbour history of the last 16 hellos,
and the delivery ratio from it gives the link cost (256 / df^2). Routes
learned through a neighbour add that cost instead of a flat 256, so the
lossy 5 km link to the school stops winning over two good short hops.

Assumes symmetric links for now; we have no way to learn the reverse
delivery ratio until hellos carry an IHU.`,
      author: "felix",
      daysAgo: 339,
      changes: {
        "src/etx.rs": etxRs,
        "src/neighbour.rs": neighbourRs,
        "src/lib.rs": libRsNeighbours,
        "src/main.rs": mainRsNeighbours,
        "src/route.rs": [
          [
            "    pub fn handle(&mut self, packet: Packet, from: SocketAddr) {",
            "    /// Handle a packet from a neighbour whose link currently costs link_cost.\n    pub fn handle(&mut self, packet: Packet, from: SocketAddr, link_cost: u16) {",
          ],
          ["metric.saturating_add(256)", "metric.saturating_add(link_cost)"],
        ],
      },
    },
    {
      label: "readme-openwrt",
      message: `README: cross-compiling for OpenWrt

Took me an evening to get a mipsel binary that links against musl and
actually starts on the TL-WR902. Writing it down so nobody else has to.`,
      author: "oskar",
      daysAgo: 327,
      changes: {
        "README.md": [
          [
            "The release profile is tuned for size. A stripped mipsel binary is a bit\nover 1 MB.\n",
            `The release profile is tuned for size. A stripped mipsel binary is a bit
over 1 MB.

### OpenWrt

Most of our routers are mipsel (ramips) or aarch64 (mediatek/filogic).
Build against musl with the OpenWrt SDK's toolchain as the linker:

    rustup target add mipsel-unknown-linux-musl
    export CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_MUSL_LINKER=mipsel-openwrt-linux-musl-gcc
    cargo +nightly build --release --target mipsel-unknown-linux-musl -Zbuild-std=std,panic_abort

mipsel is a tier 3 target, hence nightly and build-std. aarch64 works on
stable with \`--target aarch64-unknown-linux-musl\`.
`,
          ],
        ],
      },
    },
    {
      label: "announce",
      message: `Announce local prefixes and re-announce learned routes

Up to now meshd only listened. Each router now sends an update every
fourth hello with the prefixes from its config at metric 0 and every
route it has selected at that route's metric, which is what turns this
into an actual distance-vector protocol.`,
      author: "diego",
      daysAgo: 309,
      changes: {
        "src/main.rs": [
          [
            '    info!("meshd {} starting',
            '    let local = config.local_prefixes()?;\n    info!("meshd {} starting',
          ],
          [
            "    let mut next_hello = Instant::now();\n",
            "    let mut next_hello = Instant::now();\n    let mut next_update = Instant::now();\n",
          ],
          [
            "            next_hello = now + config.hello_interval();\n        }\n",
            "            next_hello = now + config.hello_interval();\n        }\n        if now >= next_update {\n            send_all(&socket, &ifindexes, &table.updates(&local));\n            next_update = now + config.hello_interval() * 4;\n        }\n",
          ],
        ],
        "src/route.rs": [
          [
            "#[derive(Debug, Clone)]\npub struct Route {",
            `impl std::str::FromStr for Prefix {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> anyhow::Result<Prefix> {
        let (addr, len) = s
            .split_once('/')
            .ok_or_else(|| anyhow::anyhow!("missing /len in {s}"))?;
        let addr: Ipv6Addr = addr.parse()?;
        let len: u8 = len.parse()?;
        anyhow::ensure!(len <= 128, "prefix length {len} out of range");
        Ok(Prefix { addr: addr.octets(), len })
    }
}

#[derive(Debug, Clone)]
pub struct Route {`,
          ],
          [
            "    pub fn expire(&mut self, now: Instant) {",
            `    /// Everything we announce: our own prefixes at metric 0, then every
    /// selected route at its current metric.
    pub fn updates(&self, local: &[Prefix]) -> Packet {
        let mut tlvs: Vec<Tlv> = local
            .iter()
            .map(|p| Tlv::Update {
                prefix: p.addr,
                plen: p.len,
                seqno: self.seqno,
                metric: 0,
                router_id: self.router_id,
            })
            .collect();
        tlvs.extend(self.routes.values().map(|r| Tlv::Update {
            prefix: r.prefix.addr,
            plen: r.prefix.len,
            seqno: r.seqno,
            metric: r.metric,
            router_id: r.router_id,
        }));
        Packet { sender: self.router_id, tlvs }
    }

    pub fn expire(&mut self, now: Instant) {`,
          ],
        ],
        "src/config.rs": [
          [
            "use serde::Deserialize;\n",
            "use serde::Deserialize;\n\nuse crate::route::Prefix;\n",
          ],
          [
            "    pub interfaces: Vec<Interface>,\n}",
            "    pub interfaces: Vec<Interface>,\n    /// Prefixes this router announces, e.g. \"fd42:6d65:7368:12::/64\".\n    #[serde(default)]\n    pub prefixes: Vec<String>,\n}",
          ],
          [
            "    pub fn hello_interval(&self) -> Duration {",
            "    pub fn local_prefixes(&self) -> Result<Vec<Prefix>> {\n        self.prefixes.iter().map(|p| p.parse()).collect()\n    }\n\n    pub fn hello_interval(&self) -> Duration {",
          ],
        ],
        "meshd.example.toml": [
          [
            "hello_interval_ms = 4000\n",
            "hello_interval_ms = 4000\n\n# Prefixes this router announces to the mesh: usually the /64 its clients\n# get addresses from.\nprefixes = [\"fd42:6d65:7368:12::/64\"]\n",
          ],
        ],
      },
    },
    {
      label: "v0.1.0",
      message: `Release 0.1.0`,
      author: "diego",
      daysAgo: 296,
      changes: {
        "Cargo.toml": [['version = "0.0.1"', 'version = "0.1.0"']],
        "CHANGELOG.md": changelog010,
      },
    },
    {
      label: "retract",
      message: `route: drop routes on retraction

An update with an infinite metric is a retraction. We treated it as a
feasible update and installed a route with metric 65535, so a router
that lost its uplink kept attracting traffic until the route expired a
minute later. Now a retraction from the current next hop removes the
route and tells the kernel.`,
      author: "ada",
      daysAgo: 281,
      changes: {
        "src/route.rs": [
          [
            "        if router_id == self.router_id || !self.feasible(prefix, router_id, seqno, metric) {\n            return;\n        }\n",
            `        if router_id == self.router_id || !self.feasible(prefix, router_id, seqno, metric) {
            return;
        }
        if metric == INFINITY {
            if self.routes.get(&prefix).is_some_and(|r| r.next_hop == next_hop) {
                debug!("route {prefix} retracted by {next_hop}");
                self.routes.remove(&prefix);
                self.changed.push(prefix);
            }
            return;
        }
`,
          ],
        ],
      },
    },
    {
      label: "harden-unit",
      message: `contrib: run meshd as its own user under systemd

meshd binds an unprivileged UDP port and only needs CAP_NET_ADMIN to
change routes, so there is no reason to run it as root. Also locks the
filesystem down and gives it /run/meshd for the control socket we're
about to add.

Create the user first: useradd --system --no-create-home meshd`,
      author: "oskar",
      daysAgo: 268,
      changes: {
        "contrib/meshd.service": systemdUnitHardened,
      },
    },
    {
      label: "control",
      message: `Add a control socket

A Unix socket that answers "routes" and "version" with a line of JSON.
It's the minimum the map bridge needs, and it beats grepping debug
logs on a router over a 2 Mbit link.

Served from the main loop rather than its own thread: requests are
rare and tiny, and the routing table stays single-owner.`,
      author: "felix",
      daysAgo: 252,
      changes: {
        "src/control.rs": controlRs,
        "src/lib.rs": libRsControl,
        "src/main.rs": [
          [
            "use meshd::config::Config;\n",
            "use meshd::config::Config;\nuse meshd::control::Control;\n",
          ],
          [
            "    socket.set_read_timeout(Some(Duration::from_millis(250)))?;\n",
            "    socket.set_read_timeout(Some(Duration::from_millis(250)))?;\n    let control = Control::bind(&config.control_socket)?;\n",
          ],
          [
            "        table.expire(Instant::now());\n",
            "        control.poll(&table);\n        table.expire(Instant::now());\n",
          ],
        ],
        "src/config.rs": [
          ["use std::path::Path;\n", "use std::path::{Path, PathBuf};\n"],
          [
            "    #[serde(default)]\n    pub prefixes: Vec<String>,\n}",
            '    #[serde(default)]\n    pub prefixes: Vec<String>,\n    #[serde(default = "default_control_socket")]\n    pub control_socket: PathBuf,\n}',
          ],
          [
            "fn default_hello_interval() -> u64 {\n    4000\n}\n",
            'fn default_hello_interval() -> u64 {\n    4000\n}\n\nfn default_control_socket() -> PathBuf {\n    PathBuf::from("/run/meshd.sock")\n}\n',
          ],
        ],
        "Cargo.toml": [
          [
            'serde = { version = "1", features = ["derive"] }\n',
            'serde = { version = "1", features = ["derive"] }\nserde_json = "1"\n',
          ],
        ],
        "meshd.example.toml": [
          [
            "# Every interface meshd",
            "# Where meshd answers control requests (see docs/control-protocol.md).\n# Under the systemd unit in contrib/ use /run/meshd/meshd.sock.\ncontrol_socket = \"/run/meshd.sock\"\n\n# Every interface meshd",
          ],
        ],
      },
    },
    {
      label: "control-docs",
      message: `docs: describe the control protocol`,
      author: "felix",
      daysAgo: 247,
      changes: {
        "docs/control-protocol.md": controlDocs,
      },
    },
    {
      label: "hello-interval",
      message: `Advertise the configured hello interval

Hellos always claimed a 4 s interval (400 cs) whatever
hello_interval_ms said. With hello_interval_ms = 1000 our neighbours
waited 6 s before counting a hello as missed, so a dead link looked
healthy for far too long.

Packet::hello now takes the interval, and tests cover the encoding.`,
      author: "kofi",
      daysAgo: 214,
      changes: {
        "src/packet.rs": [
          [
            "use anyhow::{bail, ensure, Result};\n",
            "use std::time::Duration;\n\nuse anyhow::{bail, ensure, Result};\n",
          ],
          [
            "    pub fn hello(sender: u64, seqno: u16) -> Packet {\n        Packet { sender, tlvs: vec![Tlv::Hello { seqno, interval_cs: 400 }] }\n    }\n",
            "    pub fn hello(sender: u64, seqno: u16, interval: Duration) -> Packet {\n        let interval_cs = (interval.as_millis() / 10).min(u128::from(u16::MAX)) as u16;\n        Packet { sender, tlvs: vec![Tlv::Hello { seqno, interval_cs }] }\n    }\n",
          ],
        ],
        "src/main.rs": [
          [
            "&Packet::hello(config.router_id, seqno)",
            "&Packet::hello(config.router_id, seqno, config.hello_interval())",
          ],
        ],
        "tests/packet.rs": testsPacketInterval,
      },
    },
    {
      label: "v0.2.0",
      message: `Release 0.2.0`,
      author: "diego",
      daysAgo: 203,
      changes: {
        "Cargo.toml": [['version = "0.1.0"', 'version = "0.2.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.2.0

- Control socket with \`routes\` and \`version\` commands, documented in
  docs/control-protocol.md
- Retractions remove routes immediately instead of installing them with
  an infinite metric (ada)
- Hellos advertise the configured interval instead of always 4 s (kofi)
- systemd unit runs meshd as its own user with only CAP_NET_ADMIN
- README explains cross-compiling for OpenWrt
`,
          ],
        ],
      },
    },
    {
      label: "neighbours-cmd",
      message: `control: add a neighbours command

Lists every neighbour with its router id, link-local address, link cost
and delivery ratio. The map needs this to colour links; until now it
could only see routes, which say nothing about the radio in between.`,
      author: "noor",
      daysAgo: 188,
      changes: {
        "src/control.rs": [
          [
            "use crate::route::RouteTable;\n",
            "use crate::neighbour::Neighbours;\nuse crate::route::RouteTable;\n",
          ],
          [
            "    seqno: u16,\n}\n",
            "    seqno: u16,\n}\n\n#[derive(Serialize)]\nstruct NeighbourInfo {\n    router_id: String,\n    addr: String,\n    cost: u16,\n    delivery_ratio: f32,\n}\n",
          ],
          [
            "    pub fn poll(&self, table: &RouteTable) {",
            "    pub fn poll(&self, table: &RouteTable, neighbours: &Neighbours) {",
          ],
          [
            "            if let Err(e) = serve(stream, table) {",
            "            if let Err(e) = serve(stream, table, neighbours) {",
          ],
          [
            "fn serve(stream: UnixStream, table: &RouteTable) -> Result<()> {",
            "fn serve(stream: UnixStream, table: &RouteTable, neighbours: &Neighbours) -> Result<()> {",
          ],
          [
            '        "routes" => json!({ "routes": routes(table) }),\n',
            '        "routes" => json!({ "routes": routes(table) }),\n        "neighbours" => json!({ "neighbours": neighbour_list(neighbours) }),\n',
          ],
          [
            "            seqno: r.seqno,\n        })\n        .collect()\n}\n",
            `            seqno: r.seqno,
        })
        .collect()
}

fn neighbour_list(neighbours: &Neighbours) -> Vec<NeighbourInfo> {
    neighbours
        .iter()
        .map(|n| NeighbourInfo {
            router_id: format!("{:016x}", n.router_id),
            addr: n.addr.to_string(),
            cost: n.etx.cost(),
            delivery_ratio: n.etx.delivery_ratio(),
        })
        .collect()
}
`,
          ],
        ],
        "src/main.rs": [["control.poll(&table);", "control.poll(&table, &neighbours);"]],
        "docs/control-protocol.md": [
          [
            "Unknown commands return",
            `### \`neighbours\`

Every neighbour we have heard a hello from recently.

| Field | Type | Meaning |
|---|---|---|
| \`router_id\` | string | 16 hex digits |
| \`addr\` | string | link-local address, with scope and port |
| \`cost\` | number | current link cost; 256 is perfect, 65535 unreachable |
| \`delivery_ratio\` | number | share of the last 16 hellos received, 0 to 1 |

Unknown commands return`,
          ],
        ],
      },
    },
    {
      label: "quiet-kernel",
      message: `route: only touch the kernel when a route changes

Every update for an already-selected route queued a kernel change, so a
router with 40 routes ran ip(8) 40 times every 16 seconds whether or
not anything had changed. On the TL-WR902 that was a steady 15% CPU.
Now we only queue a change when the next hop or metric differs.`,
      author: "felix",
      daysAgo: 163,
      changes: {
        "src/route.rs": [
          [
            "            self.routes.insert(prefix, route);\n            self.changed.push(prefix);\n",
            "            let old = self.routes.insert(prefix, route);\n            if old.map_or(true, |o| o.next_hop != next_hop || o.metric != metric) {\n                self.changed.push(prefix);\n            }\n",
          ],
        ],
      },
    },
    {
      label: "hysteresis",
      message: `route: require a margin before switching next hop

Two neighbours offering near-equal metrics took turns being "better"
every update, because ETX on both moved by a few units each hello. Each
switch replaced the kernel route and reset TCP connections' path MTU
discovery for no gain.

A different neighbour now has to beat the current route by 96 (about a
third of a perfect hop) before we switch.`,
      author: "felix",
      daysAgo: 151,
      changes: {
        "src/route.rs": [
          [
            "const ROUTE_EXPIRY: Duration = Duration::from_secs(60);\n",
            "const ROUTE_EXPIRY: Duration = Duration::from_secs(60);\n/// A different neighbour must beat the current route by this much before\n/// we switch, so two near-equal paths don't take turns every update.\nconst SWITCH_HYSTERESIS: u16 = 96;\n",
          ],
          [
            "            Some(r) => r.next_hop == next_hop || metric < r.metric,",
            "            Some(r) => r.next_hop == next_hop || metric.saturating_add(SWITCH_HYSTERESIS) < r.metric,",
          ],
        ],
      },
    },
    {
      label: "route-tests",
      message: `Add route table tests

Feasibility, retractions, ignoring our own announcements and seqno
wraparound. Writing them turned up nothing new, which I'll take.`,
      author: "ada",
      daysAgo: 131,
      changes: {
        "tests/route_table.rs": routeTests,
      },
    },
    {
      label: "mtu",
      message: `Split updates so each packet fits in the MTU

Once a mesh has more than 46 prefixes the update packet goes past 1500
bytes. The kernel fragments it, and the cheap radios drop fragments
often enough that the tail of the routing table never made it across
some links. Updates are now split into packets of at most 46 TLVs:
(1500 - 40 - 8 - 12) / 31 bytes per update, rounded down.`,
      author: "felix",
      daysAgo: 119,
      changes: {
        "src/route.rs": [
          [
            "const SWITCH_HYSTERESIS: u16 = 96;\n",
            "const SWITCH_HYSTERESIS: u16 = 96;\n/// Updates per packet so a packet fits in a 1500-byte MTU without fragmenting.\nconst UPDATES_PER_PACKET: usize = 46;\n",
          ],
          [
            "    pub fn updates(&self, local: &[Prefix]) -> Packet {",
            "    pub fn updates(&self, local: &[Prefix]) -> Vec<Packet> {",
          ],
          [
            "        Packet { sender: self.router_id, tlvs }\n",
            "        tlvs.chunks(UPDATES_PER_PACKET)\n            .map(|chunk| Packet { sender: self.router_id, tlvs: chunk.to_vec() })\n            .collect()\n",
          ],
        ],
        "src/main.rs": [
          [
            "            send_all(&socket, &ifindexes, &table.updates(&local));\n",
            "            for packet in table.updates(&local) {\n                send_all(&socket, &ifindexes, &packet);\n            }\n",
          ],
        ],
      },
    },
    {
      label: "readme-typo",
      message: `README: link to the example config from Running

Two people in a week asked where the config options are documented.`,
      author: "tomas",
      daysAgo: 108,
      changes: {
        "README.md": [
          [
            "See `meshd.example.toml` for every option.",
            "Every option is documented in [`meshd.example.toml`](meshd.example.toml).",
          ],
        ],
      },
    },
    {
      label: "ghost",
      message: `Forget neighbours that stay silent

Neighbours were never removed, only given MAX_COST. After moving the
school's router to a new mast, the old link-local address sat in the
neighbour table (and in the map) for weeks. A neighbour we haven't heard
for 16 hello intervals is now dropped.`,
      author: "diego",
      daysAgo: 94,
      changes: {
        "src/neighbour.rs": [
          [
            "                n.etx.missed();\n            }\n        }\n",
            `                n.etx.missed();
            }
        }
        self.by_addr.retain(|addr, n| {
            let silent = now.duration_since(n.last_hello);
            let keep = silent < n.interval * 16;
            if !keep {
                info!("neighbour {:016x} at {addr} gone after {}s", n.router_id, silent.as_secs());
            }
            keep
        });
`,
          ],
        ],
      },
    },
    {
      label: "plen",
      message: `packet: reject updates with a prefix length over 128

A router running a hand-patched build sent plen 255, and we passed it
straight to ip(8), which complained once per update for an hour. Treat
it as a malformed packet instead.`,
      author: "felix",
      daysAgo: 71,
      changes: {
        "src/packet.rs": [
          [
            "                8 if len == 29 => tlvs.push(Tlv::Update {\n                    plen: v[0],\n                    prefix: v[1..17].try_into()?,\n                    seqno: u16::from_be_bytes([v[17], v[18]]),\n                    metric: u16::from_be_bytes([v[19], v[20]]),\n                    router_id: u64::from_be_bytes(v[21..29].try_into()?),\n                }),\n",
            "                8 if len == 29 => {\n                    ensure!(v[0] <= 128, \"prefix length {} out of range\", v[0]);\n                    tlvs.push(Tlv::Update {\n                        plen: v[0],\n                        prefix: v[1..17].try_into()?,\n                        seqno: u16::from_be_bytes([v[17], v[18]]),\n                        metric: u16::from_be_bytes([v[19], v[20]]),\n                        router_id: u64::from_be_bytes(v[21..29].try_into()?),\n                    })\n                }\n",
          ],
        ],
        "tests/packet.rs": [
          [
            "    assert!(Packet::decode(&bytes[..bytes.len() - 2]).is_err());\n}\n",
            `    assert!(Packet::decode(&bytes[..bytes.len() - 2]).is_err());
}

#[test]
fn prefix_length_over_128_is_rejected() {
    let mut p = Packet {
        sender: 9,
        tlvs: vec![Tlv::Update { prefix: [0; 16], plen: 64, seqno: 1, metric: 0, router_id: 9 }],
    };
    if let Tlv::Update { plen, .. } = &mut p.tlvs[0] {
        *plen = 255;
    }
    assert!(Packet::decode(&p.encode()).is_err());
}
`,
          ],
        ],
      },
    },
    {
      label: "v0.3.0",
      message: `Release 0.3.0`,
      author: "diego",
      daysAgo: 58,
      changes: {
        "Cargo.toml": [['version = "0.2.0"', 'version = "0.3.0"']],
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            `# Changelog

## 0.3.0

- \`neighbours\` control command with link cost and delivery ratio (noor)
- Updates are split to fit the MTU; large meshes no longer lose routes
  to fragment loss
- A margin of 96 is required before switching to a different next hop,
  which stops near-equal paths from flapping
- The kernel is only touched when a route actually changes
- Silent neighbours are forgotten after 16 hello intervals
- Updates with a prefix length over 128 are rejected
`,
          ],
        ],
      },
    },
    {
      label: "procd",
      message: `contrib: add a procd init script for OpenWrt

Respawns meshd if it dies and sends its log to logread. Tested on 23.05
on a GL-MT3000.`,
      author: "yuki",
      daysAgo: 44,
      changes: {
        "contrib/meshd.init": procdInit,
        "README.md": [
          [
            "stable with `--target aarch64-unknown-linux-musl`.\n",
            "stable with `--target aarch64-unknown-linux-musl`.\n\nCopy the binary to `/usr/sbin/meshd` and `contrib/meshd.init` to\n`/etc/init.d/meshd`, then `/etc/init.d/meshd enable && /etc/init.d/meshd start`.\n",
          ],
        ],
      },
    },
    {
      label: "etx-ewma",
      message: `etx: smooth link cost with an EWMA

A single lost hello on a perfect link moved its cost from 256 to 290,
and two in a row to 330, which was enough to flip routes on the Umeå
mesh several times an hour even with the switching margin. The cost we
hand out is now an exponentially weighted moving average (alpha 0.25)
of the raw ETX.

Becoming reachable or unreachable skips the average, so a dead link is
still dropped straight away and a new neighbour is usable straight away.`,
      author: "oskar",
      daysAgo: 31,
      changes: {
        "src/etx.rs": etxRsEwma,
      },
    },
    {
      label: "etx-ewma-log",
      message: `CHANGELOG: start an Unreleased section`,
      author: "oskar",
      daysAgo: 31,
      changes: {
        "CHANGELOG.md": [
          [
            "# Changelog\n",
            "# Changelog\n\n## Unreleased\n\n- Link costs are smoothed with an EWMA, so a single lost hello no longer\n  moves routes (oskar)\n",
          ],
        ],
      },
    },
    {
      label: "docs-socat",
      message: `docs: fix the socat example for the control socket

Without -t, socat closes the connection half a second after stdin hits
EOF; on a busy router meshd hadn't answered yet and the reply was
silently lost. Also mention the socket path under the systemd unit.`,
      author: "self",
      daysAgo: 16,
      changes: {
        "docs/control-protocol.md": [
          [
            "    $ echo routes | socat - UNIX-CONNECT:/run/meshd.sock\n",
            "    $ echo routes | socat -t 2 - UNIX-CONNECT:/run/meshd.sock\n",
          ],
          [
            "200ms for it.\n",
            "200ms for it.\n\nUnder the systemd unit in `contrib/` the socket lives in meshd's runtime\ndirectory instead: set `control_socket = \"/run/meshd/meshd.sock\"`.\n",
          ],
        ],
        "CHANGELOG.md": [
          [
            "  moves routes (oskar)\n",
            "  moves routes (oskar)\n- Control protocol docs: the socat example no longer drops replies\n",
          ],
        ],
      },
    },
    {
      label: "neighbour-age",
      message: `control: report when each neighbour was last heard

noor asked for this for the map's "last seen" tooltip. Adds
last_seen_ms and hello_interval_ms to each neighbour so clients can
tell a quiet neighbour from a missing one without guessing our
interval.`,
      author: "felix",
      daysAgo: 7,
      changes: {
        "src/control.rs": [
          [
            "    delivery_ratio: f32,\n}\n",
            "    delivery_ratio: f32,\n    last_seen_ms: u64,\n    hello_interval_ms: u64,\n}\n",
          ],
          [
            "            delivery_ratio: n.etx.delivery_ratio(),\n",
            "            delivery_ratio: n.etx.delivery_ratio(),\n            last_seen_ms: n.last_hello.elapsed().as_millis() as u64,\n            hello_interval_ms: n.interval.as_millis() as u64,\n",
          ],
        ],
        "docs/control-protocol.md": [
          [
            "| `delivery_ratio` | number | share of the last 16 hellos received, 0 to 1 |\n",
            "| `delivery_ratio` | number | share of the last 16 hellos received, 0 to 1 |\n| `last_seen_ms` | number | milliseconds since the last hello |\n| `hello_interval_ms` | number | the interval the neighbour advertises |\n",
          ],
        ],
        "CHANGELOG.md": [
          [
            "- Control protocol docs:",
            "- `neighbours` reports `last_seen_ms` and `hello_interval_ms`\n- Control protocol docs:",
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Cross-compiling for mipsel fails to link",
      author: "priya",
      daysAgo: 331,
      body: `Trying to build for our ramips routers (MT7621) and the link step fails:

\`\`\`
$ cargo build --release --target mipsel-unknown-linux-musl
error[E0463]: can't find crate for \`std\`
  |
  = note: the \`mipsel-unknown-linux-musl\` target may not be installed
\`\`\`

\`rustup target add mipsel-unknown-linux-musl\` says the component is unavailable. Is there a prebuilt binary somewhere, or what are you all using?`,
      labels: ["question", "docs"],
      state: "solved",
      closedHoursAfter: 80,
      comments: [
        {
          author: "oskar",
          body: "mipsel dropped to tier 3 a while back, so there's no prebuilt std any more. You need nightly and `-Zbuild-std`. I got it working last night, give me a day to write it down properly.",
          hoursAfter: 6,
        },
        {
          author: "priya",
          body: "Nightly + build-std worked, thanks! Had to point the linker at the SDK's `mipsel-openwrt-linux-musl-gcc` as well, otherwise it picks the host cc.",
          hoursAfter: 30,
          replyTo: 0,
        },
        {
          author: "oskar",
          body: "Yep, that's in the README now.",
          hoursAfter: 80,
          reactions: [{ emoji: "🙏", by: ["priya", "diego"] }],
        },
      ],
    },
    {
      title: "Dead uplink keeps attracting traffic for a minute",
      author: "diego",
      daysAgo: 287,
      body: `When the gateway on the school roof loses its uplink it sends a retraction for \`::/0\`, but the other routers keep sending traffic its way for about 60 seconds.

\`ip -6 route show proto 42\` on a neighbour during that window:

\`\`\`
default via fe80::2a1:b2ff:fec3:d4e5 dev wlan0 metric 65535
\`\`\`

So we *did* get the retraction, and installed it as a route.`,
      labels: ["bug"],
      assignees: ["ada"],
      state: "solved",
      closedHoursAfter: 150,
      comments: [
        {
          author: "ada",
          body: "`feasible()` returns true for INFINITY (correctly, retractions are always feasible), and then `update()` treats it like any other route. It should remove the route if it comes from the current next hop and otherwise ignore it. I can take this.",
          hoursAfter: 4,
          reactions: [{ emoji: "👍", by: ["diego", "felix"] }],
        },
        {
          author: "felix",
          body: "Should we also send a route request to the other neighbours at that point, so we find an alternative before the next periodic update?",
          hoursAfter: 9,
          replyTo: 0,
        },
        {
          author: "ada",
          body: "Eventually yes, but that needs a request TLV. Let's get the basic fix in first; the alternative path shows up within 16 s anyway.",
          hoursAfter: 11,
          replyTo: 1,
        },
        {
          author: "ada",
          body: "Fixed on main. The kernel route is removed as soon as the retraction arrives.",
          hoursAfter: 150,
        },
      ],
    },
    {
      title: "Run without root?",
      author: "oskar",
      daysAgo: 272,
      body: "meshd currently runs as root everywhere. On Debian-based routers I'd like to run it as a dedicated user. As far as I can tell it only needs `CAP_NET_ADMIN` for `ip route`, since 6696 isn't a privileged port. Anything else I'm missing?",
      labels: ["question"],
      state: "solved",
      closedHoursAfter: 100,
      comments: [
        {
          author: "felix",
          body: "Joining the multicast group doesn't need anything special. `ip` is a separate process though, so the capability has to be ambient, not just permitted.",
          hoursAfter: 5,
        },
        {
          author: "oskar",
          body: "Right, `AmbientCapabilities=CAP_NET_ADMIN` in the unit then. Running it like that on two routers now, will send the unit change if nothing breaks by the weekend.",
          hoursAfter: 20,
          replyTo: 0,
        },
        {
          author: "diego",
          body: "OpenWrt runs everything as root anyway, so this is mostly for the Debian boxes. Fine by me.",
          hoursAfter: 26,
        },
      ],
    },
    {
      title: "Document the control socket JSON",
      author: "noor",
      daysAgo: 250,
      body: "I'm starting on the map bridge. Could the fields returned by `routes` be written down somewhere? I'd rather not reverse-engineer them from `control.rs`, and I'd like to know which ones you consider stable.",
      labels: ["docs"],
      assignees: ["felix"],
      state: "solved",
      closedHoursAfter: 70,
      comments: [
        {
          author: "felix",
          body: "Fair. I've written up docs/control-protocol.md. Everything in there is stable for 0.x unless we say otherwise in the changelog.",
          hoursAfter: 70,
          reactions: [{ emoji: "❤️", by: ["noor"] }],
        },
      ],
    },
    {
      title: "hello_interval_ms is ignored on the wire",
      author: "kofi",
      daysAgo: 220,
      body: `I set \`hello_interval_ms = 1000\` on two test routers to speed up convergence. Local behaviour changed (hellos go out every second) but neighbours still behave as if it's 4 s: a router I unplug keeps a good cost for ~6 s.

tcpdump shows the hello TLV always carries \`interval 400\` (centiseconds).`,
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 140,
      comments: [
        {
          author: "felix",
          body: "Yep, `Packet::hello` hardcodes 400. Embarrassing. Want to send the fix since you found it?",
          hoursAfter: 3,
        },
        {
          author: "kofi",
          body: "Sure, on it.",
          hoursAfter: 5,
          replyTo: 0,
        },
      ],
    },
    {
      title: "meshd forks ip(8) hundreds of times a minute",
      author: "oskar",
      daysAgo: 170,
      body: `On the TL-WR902 (MT7628, 64 MB) meshd sits at 12–18% CPU on an otherwise idle mesh. \`perf\` isn't available there, but \`top\` shows a constant stream of short-lived \`ip\` processes.

40 routes, update interval 16 s. That's 2.5 forks a second just to replace routes with themselves.`,
      labels: ["perf"],
      assignees: ["felix"],
      state: "solved",
      closedHoursAfter: 175,
      comments: [
        {
          author: "felix",
          body: "Every update for the selected route pushes to `changed`, even when nothing changed. Should be a two-line fix.",
          hoursAfter: 8,
        },
        {
          author: "malik",
          body: "Longer term, talking netlink directly would avoid the forks entirely. Happy to look into it if there's interest.",
          hoursAfter: 30,
        },
        {
          author: "diego",
          body: "Interest yes, but a netlink crate adds a lot of binary for us. Let's see where we are after the fix.",
          hoursAfter: 34,
          replyTo: 1,
        },
        {
          author: "oskar",
          body: "With the fix it's at 0–1%. Closing.",
          hoursAfter: 175,
          reactions: [{ emoji: "🎉", by: ["felix", "diego"] }],
        },
      ],
    },
    {
      title: "Routes flap between two near-equal paths",
      author: "diego",
      daysAgo: 158,
      body: `Rooftops 3 and 5 both reach the gateway at metric ~520. Every update or two, routers behind them switch between the two:

\`\`\`
[meshd::route] route ::/0 via fe80::...:a1%wlan0 metric 518
[meshd::route] route ::/0 via fe80::...:b7%wlan0 metric 516
[meshd::route] route ::/0 via fe80::...:a1%wlan0 metric 515
\`\`\`

Users notice it as video calls freezing for a second.`,
      labels: ["bug"],
      assignees: ["felix"],
      state: "solved",
      closedHoursAfter: 170,
      comments: [
        {
          author: "felix",
          body: "We switch on any strict improvement. Babel implementations usually add hysteresis; I'll try requiring a margin.",
          hoursAfter: 10,
        },
        {
          author: "ada",
          body: "Smoothing the link cost would help as well, the raw ETX is very jumpy. Both are worth doing.",
          hoursAfter: 22,
          replyTo: 0,
        },
        {
          author: "diego",
          body: "Margin of 96 has been on Cerro Verde for three days, zero flaps. Thanks!",
          hoursAfter: 170,
        },
      ],
    },
    {
      title: "Routes missing on large meshes: updates bigger than MTU",
      author: "oskar",
      daysAgo: 124,
      body: `The Umeå mesh just went past 50 prefixes, and since then a few routers are consistently missing the same handful of routes. tcpdump on wlan0:

\`\`\`
IP6 fe80::...:42.6696 > ff02::1:6.6696: frag (0|1448) UDP, length 1594
IP6 fe80::...:42 > ff02::1:6: frag (1448|146)
\`\`\`

The second fragment frequently never arrives on the weaker links, and then the whole update is lost.`,
      labels: ["bug"],
      assignees: ["felix"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "felix",
          body: "Of course. We build one packet with everything. I'll chunk the updates.",
          hoursAfter: 4,
        },
        {
          author: "ada",
          body: "Worth keeping a margin below 1500: some of you run batman or wireguard underneath and the effective MTU is lower.",
          hoursAfter: 12,
          replyTo: 0,
        },
        {
          author: "felix",
          body: "Good point. I'm using 1500 for now since that's what all three networks have on the mesh interface, but I'll note it. Making it configurable is easy if someone needs it.",
          hoursAfter: 20,
          replyTo: 1,
        },
      ],
    },
    {
      title: "Ghost neighbours never go away",
      author: "lena",
      daysAgo: 99,
      body: "After we replaced a router, its old address is still listed under `neighbours` (cost 65535) five days later, and it shows up as a grey dot on the map. Restarting meshd clears it.",
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "diego",
          body: "Same here after moving the school router. Neighbours are never removed, only marked unreachable. I'll fix it.",
          hoursAfter: 14,
          reactions: [{ emoji: "👍", by: ["lena"] }],
        },
      ],
    },
    {
      title: "IPv4 support",
      author: "jonas",
      daysAgo: 150,
      body: "Our community network still gives clients IPv4 and NATs at two gateways. Right now that means static IPv4 routes on every rooftop next to meshd. Is IPv4 on the roadmap, and what would it take?",
      labels: ["enhancement"],
      assignees: ["felix"],
      comments: [
        {
          author: "felix",
          body: "It's the most-asked feature, so yes. The wire format needs a decision first: either a new TLV or IPv4-mapped addresses in the existing one. I'll write up the options.",
          hoursAfter: 20,
        },
        {
          author: "ada",
          body: "Please not IPv4-mapped in the existing TLV. Old routers would install those as IPv6 routes and you get very confusing failures during a rolling upgrade.",
          hoursAfter: 26,
          replyTo: 0,
          reactions: [{ emoji: "💯", by: ["felix", "diego"] }],
        },
        {
          author: "jonas",
          body: "Do the routers need IPv4 addresses on the mesh links for this? That would be a pain for us, we have none there today.",
          hoursAfter: 50,
        },
        {
          author: "felix",
          body: "No: Linux can route IPv4 via an IPv6 next hop since 5.2 (`via inet6`). All our hardware is on newer kernels than that.",
          hoursAfter: 55,
          replyTo: 2,
        },
        {
          author: "felix",
          body: "I've put design notes up as a draft patch. Comments welcome there, especially on default routes.",
          hoursAfter: 3075,
        },
      ],
    },
    {
      title: "ETX jumps around on a busy link",
      author: "diego",
      daysAgo: 62,
      body: `Graphing the \`neighbours\` output once a second on a link that's fine in practice:

\`\`\`
cost 256 256 290 256 256 330 290 256 256 256 290 ...
\`\`\`

Each lost hello costs a big jump and it's back a few seconds later. Even with the switching margin this is enough to move routes on the larger meshes.`,
      labels: ["enhancement"],
      assignees: ["oskar"],
      state: "solved",
      closedHoursAfter: 760,
      comments: [
        {
          author: "oskar",
          body: "I'd like to try an EWMA on top of the raw cost. Should be a small, contained change in etx.rs.",
          hoursAfter: 12,
        },
        {
          author: "felix",
          body: "Go for it. Please make sure a dead link still drops at once though; averaging towards 65535 would take ages.",
          hoursAfter: 18,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Reordered hellos wipe the ETX history",
      author: "ada",
      daysAgo: 26,
      body: `Reading etx.rs: if a hello arrives with a seqno *older* than the last one (reordering, or a duplicate via a second interface), \`seqno.wrapping_sub(last)\` is ~65535, gets clamped to 16, and the whole 16-hello history is shifted out. One out-of-order packet makes a perfect link look like 1 in 16.

Haven't seen it in the field, but on a router with two radios on the same mesh it seems likely.`,
      labels: ["bug"],
      assignees: ["oskar"],
      comments: [
        {
          author: "oskar",
          body: "Good catch. Older seqnos (by the same comparison as `seqno_newer`) should just be ignored. I'll fold it in after the EWMA change lands.",
          hoursAfter: 10,
        },
        {
          author: "kofi",
          body: "I think I've seen this: a dual-radio router at the clinic shows delivery_ratio 0.06 for a few seconds now and then, with nothing in the logs.",
          hoursAfter: 40,
        },
      ],
    },
    {
      title: "meshd exits at boot if an interface doesn't exist yet",
      author: "self",
      daysAgo: 10,
      body: `On a router where \`wlan1\` is a USB radio, meshd sometimes starts before the driver has created the interface and exits:

\`\`\`
Error: no such interface: wlan1
\`\`\`

procd respawns it, so it eventually comes up, but it takes a few attempts and the log is noisy. Could meshd skip missing interfaces and retry them every so often instead?`,
      labels: ["bug", "good-first-issue"],
      comments: [
        {
          author: "diego",
          body: "Yes, I've seen this with USB radios too. Skipping and retrying every hello interval seems right; we'd also need to leave the multicast group when an interface disappears.",
          hoursAfter: 7,
        },
        {
          author: "yuki",
          body: "Workaround in the meantime: add `procd_add_interface_trigger` to the init script so procd restarts meshd when the interface appears.",
          hoursAfter: 20,
          reactions: [{ emoji: "👀", by: ["self"] }],
        },
        {
          author: "self",
          body: "I can try a patch for the retry if nobody's on it.",
          hoursAfter: 26,
          replyTo: 0,
        },
        {
          author: "diego",
          body: "All yours.",
          hoursAfter: 31,
          replyTo: 2,
        },
      ],
    },
    {
      title: "Fixed cost for wired links",
      author: "diego",
      daysAgo: 15,
      body: "Two of our rooftops link routers on the same roof with ethernet. ETX on a wire is always 256, same as a perfect radio hop, so meshd happily routes over a radio hop instead. I'd like a per-interface `wired = true` that gives those links a lower fixed cost.",
      labels: ["enhancement"],
      assignees: ["diego"],
      comments: [
        {
          author: "felix",
          body: "Babel uses 96 for wired links, so that's a sensible default. As long as we still notice when the cable is unplugged.",
          hoursAfter: 5,
        },
      ],
    },
  ],
  patches: [
    {
      title: "control: add a neighbours command",
      author: "noor",
      daysAgo: 192,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description:
            "The map bridge needs per-link information to colour the lines between rooftops. This adds a `neigh` command that lists each neighbour's router id, address and link cost.",
          hoursAfter: 0,
          base: "v0.2.0",
          commits: [
            {
              message: `control: add a neigh command`,
              author: "noor",
              daysAgo: 192,
              changes: {
                "src/control.rs": [
                  [
                    "use crate::route::RouteTable;\n",
                    "use crate::neighbour::Neighbours;\nuse crate::route::RouteTable;\n",
                  ],
                  [
                    "    seqno: u16,\n}\n",
                    "    seqno: u16,\n}\n\n#[derive(Serialize)]\nstruct NeighbourInfo {\n    router_id: String,\n    addr: String,\n    cost: u16,\n}\n",
                  ],
                  [
                    "    pub fn poll(&self, table: &RouteTable) {",
                    "    pub fn poll(&self, table: &RouteTable, neighbours: &Neighbours) {",
                  ],
                  [
                    "            if let Err(e) = serve(stream, table) {",
                    "            if let Err(e) = serve(stream, table, neighbours) {",
                  ],
                  [
                    "fn serve(stream: UnixStream, table: &RouteTable) -> Result<()> {",
                    "fn serve(stream: UnixStream, table: &RouteTable, neighbours: &Neighbours) -> Result<()> {",
                  ],
                  [
                    '        "routes" => json!({ "routes": routes(table) }),\n',
                    '        "routes" => json!({ "routes": routes(table) }),\n        "neigh" => json!({ "neigh": neighbours.iter().map(|n| NeighbourInfo {\n            router_id: format!("{:016x}", n.router_id),\n            addr: n.addr.to_string(),\n            cost: n.etx.cost(),\n        }).collect::<Vec<_>>() }),\n',
                  ],
                ],
                "src/main.rs": [["control.poll(&table);", "control.poll(&table, &neighbours);"]],
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 20,
              verdict: "reject",
              summary:
                "Thanks noor, this is very welcome. A few things before it goes in.",
              comments: [
                {
                  body: "Could we spell it `neighbours`? `routes` and `version` are full words and `neigh` reads like iproute2. Same for the JSON key.",
                  path: "src/control.rs",
                  line: 63,
                },
                {
                  body: "Please pull this out into a function like `routes()`; a struct literal inside `json!` inside a match arm is hard to read.",
                  path: "src/control.rs",
                  line: 63,
                  endLine: 67,
                },
                {
                  body: "Since you want to colour links: the delivery ratio is probably more useful to show than the cost, which is squared. Could you include both?",
                  path: "src/control.rs",
                  line: 31,
                },
              ],
            },
          ],
          comments: [
            {
              author: "diego",
              body: "Also needs a section in docs/control-protocol.md, now that the bridge depends on it.",
              hoursAfter: 22,
            },
          ],
        },
        {
          description:
            "Renamed to `neighbours`, moved the mapping into `neighbour_list()`, added `delivery_ratio` and documented the command.",
          hoursAfter: 70,
          fromHistory: ["neighbours-cmd"],
          reviews: [
            {
              author: "felix",
              hoursAfter: 8,
              verdict: "accept",
              summary: "Lovely, thanks.",
              comments: [
                {
                  body: "Nice, this reads much better.",
                  path: "src/control.rs",
                  line: 87,
                  resolved: true,
                },
              ],
            },
            {
              author: "diego",
              hoursAfter: 26,
              verdict: "accept",
              summary: "Tried it on Cerro Verde with the bridge, works. Merging.",
            },
          ],
        },
      ],
    },
    {
      title: "Move the event loop to tokio",
      author: "malik",
      daysAgo: 142,
      labels: ["refactor"],
      state: "archived",
      revisions: [
        {
          description:
            "The main loop polls with a 250 ms socket timeout, which adds latency and wakes the CPU four times a second for nothing. This is a first step towards an async loop on tokio's current-thread runtime: the socket, control server and timers become separate futures in one `select!`. Only the skeleton for now, to see if you're open to it.",
          hoursAfter: 0,
          base: "hysteresis",
          commits: [
            {
              message: `WIP: run the main loop on tokio

Adds tokio with the current-thread runtime and turns main into an async
fn. The loop body is not converted yet.`,
              author: "malik",
              daysAgo: 142,
              changes: {
                "Cargo.toml": [
                  [
                    'toml = "0.8"\n',
                    'tokio = { version = "1", default-features = false, features = ["rt", "net", "time", "macros"] }\ntoml = "0.8"\n',
                  ],
                ],
                "src/main.rs": [
                  [
                    "fn main() -> Result<()> {",
                    '#[tokio::main(flavor = "current_thread")]\nasync fn main() -> Result<()> {',
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "diego",
              body: "Thanks for looking at this. I measured: the stripped mipsel binary goes from 1.1 MB to 2.6 MB with just this change, and we have routers with 8 MB of flash total. That alone makes it a hard sell for me.",
              hoursAfter: 18,
            },
            {
              author: "malik",
              body: "Ouch, I didn't expect that much. Would `mio` directly be acceptable? It's much smaller.",
              hoursAfter: 22,
              replyTo: 0,
            },
            {
              author: "felix",
              body: "The 250 ms wakeup is real but small; on these SoCs it's lost in the noise of the WiFi driver. If we want to fix it, `libc::poll` on two fds is ~30 lines and adds nothing to the binary.",
              hoursAfter: 30,
              reactions: [{ emoji: "👍", by: ["diego", "oskar"] }],
            },
            {
              author: "malik",
              body: "Fair enough, the size constraint is the deciding factor. Archiving this; I might send a `poll()` version later.",
              hoursAfter: 40,
              reactions: [{ emoji: "❤️", by: ["diego"] }],
            },
          ],
        },
      ],
    },
    {
      title: "etx: smooth link cost with an EWMA",
      author: "oskar",
      daysAgo: 38,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description:
            "Smooths the ETX cost with an exponentially weighted moving average (alpha 0.25), so one lost hello doesn't move routes. Tests are adjusted to warm up the average before asserting.",
          hoursAfter: 0,
          base: "procd",
          commits: [
            {
              message: `etx: smooth link cost with an EWMA`,
              author: "oskar",
              daysAgo: 38,
              changes: {
                "src/etx.rs": etxRsEwmaR1,
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 14,
              verdict: "reject",
              summary:
                "The smoothing itself looks right, but the transitions to and from unreachable are a problem.",
              comments: [
                {
                  body: "When a neighbour goes silent the raw cost becomes 65535 and we average towards it: from 256 that takes ~10 hellos to even cross 32000, so a dead link stays attractive for 40 s. Unreachable needs to be immediate.",
                  path: "src/etx.rs",
                  line: 72,
                },
                {
                  body: "Same problem the other way: the first sample of a new neighbour is 65535 (1 hello in 16), so the average starts there and the neighbour is unusable for about a minute.",
                  path: "src/etx.rs",
                  line: 73,
                },
                {
                  body: "This test only passes because it never goes back from unreachable. Could you add one that loses all hellos after a warmed-up link?",
                  path: "src/etx.rs",
                  line: 101,
                },
              ],
            },
          ],
          comments: [
            {
              author: "diego",
              body: "Ran it on two Cerro Verde routers overnight: no route changes at all, versus 14 the night before. So the direction is right.",
              hoursAfter: 20,
              reactions: [{ emoji: "🎉", by: ["oskar"] }],
            },
          ],
        },
        {
          description:
            "Transitions to or from unreachable now skip the average, as felix suggested. Added tests for a warmed-up link going silent and for a single lost hello. Also started an Unreleased section in the changelog.",
          hoursAfter: 150,
          fromHistory: ["etx-ewma", "etx-ewma-log"],
          reviews: [
            {
              author: "felix",
              hoursAfter: 6,
              verdict: "accept",
              summary: "That's it. Thanks for sticking with it.",
              comments: [
                {
                  body: "Good comment, this is exactly the reasoning someone will want in a year.",
                  path: "src/etx.rs",
                  line: 72,
                  endLine: 73,
                  resolved: true,
                },
              ],
            },
            {
              author: "diego",
              hoursAfter: 9,
              verdict: "accept",
              summary: "Running on Cerro Verde since this morning. Merging.",
            },
          ],
        },
      ],
    },
    {
      title: "docs: fix the socat example for the control socket",
      author: "self",
      daysAgo: 17,
      labels: ["docs"],
      state: "merged",
      revisions: [
        {
          description:
            "The socat example in docs/control-protocol.md drops the reply on a busy router, because socat closes 0.5 s after stdin ends. Adds `-t 2` and a note about the socket path under the systemd unit, which tripped me up too.",
          hoursAfter: 0,
          fromHistory: ["docs-socat"],
          reviews: [
            {
              author: "felix",
              hoursAfter: 5,
              verdict: "accept",
              summary: "Good catch, I'd only ever tried it on my laptop.",
            },
            {
              author: "oskar",
              hoursAfter: 11,
              verdict: "accept",
              summary: "Thanks!",
              comments: [
                {
                  body: "We should probably change the default to /run/meshd/meshd.sock at some point so this note isn't needed. Not for this patch.",
                  path: "docs/control-protocol.md",
                  line: 15,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "packet: IPv4 prefixes",
      author: "felix",
      daysAgo: 22,
      labels: ["enhancement"],
      state: "draft",
      revisions: [
        {
          description:
            "Design notes for IPv4 support only, no code yet. Comments welcome, especially on the wire format and on whether gateways need to announce an IPv4 default route.",
          hoursAfter: 0,
          base: "procd",
          commits: [
            {
              message: `docs: design notes for IPv4 prefixes`,
              author: "felix",
              daysAgo: 22,
              changes: {
                "docs/design/ipv4.md": ipv4Design,
              },
            },
          ],
          reviews: [
            {
              author: "ada",
              hoursAfter: 30,
              summary: "Agree with option 1. Two notes.",
              comments: [
                {
                  body: "A new TLV is right. Reserve the kind number in packet.rs now, even before implementing it, so nobody's experimental build grabs 10.",
                  path: "docs/design/ipv4.md",
                  line: 12,
                },
                {
                  body: "Yes, Prefix needs a family, and so does the source table. Otherwise an IPv4 and an IPv6 prefix with the same leading bytes will share feasibility state, which is a subtle loop waiting to happen.",
                  path: "docs/design/ipv4.md",
                  line: 32,
                },
              ],
            },
          ],
          comments: [
            {
              author: "jonas",
              body: "We do need a default route, our two gateways are the only way out. But I'd be happy to get prefixes first and defaults in a second step.",
              hoursAfter: 40,
            },
            {
              author: "diego",
              body: "Same for us. Default routes as a follow-up sounds right.",
              hoursAfter: 46,
              replyTo: 0,
            },
          ],
        },
      ],
    },
    {
      title: "Fixed link cost for wired interfaces",
      author: "diego",
      daysAgo: 12,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "Adds `wired = true` per interface. Neighbours heard on a wired interface get a fixed cost of 96 instead of their ETX, so a cable between two routers on the same roof wins over a radio hop.",
          hoursAfter: 0,
          base: "docs-socat",
          commits: [
            {
              message: `Use a fixed cost of 96 on wired interfaces`,
              author: "diego",
              daysAgo: 12,
              changes: {
                "src/config.rs": [
                  [
                    "pub struct Interface {\n    pub name: String,\n}",
                    "pub struct Interface {\n    pub name: String,\n    /// Ethernet and similar: links get a fixed low cost instead of ETX.\n    #[serde(default)]\n    pub wired: bool,\n}",
                  ],
                ],
                "src/main.rs": [
                  [
                    "const PORT: u16 = 6696;\n",
                    "const PORT: u16 = 6696;\n/// Cost of a wired link, as in Babel.\nconst WIRED_COST: u16 = 96;\n",
                  ],
                  [
                    "    let mut table = RouteTable::new(config.router_id);\n",
                    "    let wired: Vec<u32> = config\n        .interfaces\n        .iter()\n        .zip(&ifindexes)\n        .filter(|(iface, _)| iface.wired)\n        .map(|(_, (_, index))| *index)\n        .collect();\n\n    let mut table = RouteTable::new(config.router_id);\n",
                  ],
                  [
                    "                    let cost = neighbours.cost(&from).unwrap_or(INFINITY);\n",
                    "                    let cost = if is_wired(&from, &wired) {\n                        WIRED_COST\n                    } else {\n                        neighbours.cost(&from).unwrap_or(INFINITY)\n                    };\n",
                  ],
                  [
                    "fn sync_kernel(table: &mut RouteTable) {",
                    "fn is_wired(from: &SocketAddr, wired: &[u32]) -> bool {\n    matches!(from, SocketAddr::V6(a) if wired.contains(&a.scope_id()))\n}\n\nfn sync_kernel(table: &mut RouteTable) {",
                  ],
                  [
                    "use std::net::{Ipv6Addr, SocketAddrV6, UdpSocket};",
                    "use std::net::{Ipv6Addr, SocketAddr, SocketAddrV6, UdpSocket};",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 10,
              verdict: "reject",
              summary: "Small change, one real problem.",
              comments: [
                {
                  body: "This ignores the neighbour table completely for wired links, so an unplugged cable keeps cost 96 until the route expires a minute later. Could we use 96 only while ETX says the neighbour is reachable?",
                  path: "src/main.rs",
                  line: 79,
                  endLine: 83,
                },
                {
                  body: "Nit: the zip relies on `ifindexes` being in the same order as `config.interfaces`. True today, but storing `wired` next to the index in `ifindexes` would make that impossible to break.",
                  path: "src/main.rs",
                  line: 40,
                  endLine: 46,
                },
              ],
            },
          ],
        },
        {
          description:
            "Wired links only get the fixed cost while the neighbour is reachable by ETX, so pulling the cable still drops the route at once. Documented the option in the example config.",
          hoursAfter: 30,
          commits: [
            {
              message: `Only use the wired cost while the neighbour is reachable

An unplugged cable must still make the neighbour unreachable. Also
documents wired = true in the example config.`,
              author: "diego",
              daysAgo: 11,
              changes: {
                "src/main.rs": [
                  [
                    "                    let cost = if is_wired(&from, &wired) {\n                        WIRED_COST\n                    } else {\n                        neighbours.cost(&from).unwrap_or(INFINITY)\n                    };\n",
                    "                    let cost = match neighbours.cost(&from) {\n                        Some(c) if c < INFINITY && is_wired(&from, &wired) => WIRED_COST,\n                        Some(c) => c,\n                        None => INFINITY,\n                    };\n",
                  ],
                ],
                "meshd.example.toml": [
                  [
                    '[[interfaces]]\nname = "wlan0"\n',
                    '[[interfaces]]\nname = "wlan0"\n\n# An ethernet link to another router on the same roof. Wired links cost\n# 96 instead of their measured ETX, so they win over a radio hop.\n[[interfaces]]\nname = "eth1"\nwired = true\n',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 8,
              verdict: "accept",
              summary: "Good. I'd still like the ordering nit addressed at some point, but it doesn't need to block.",
              comments: [
                {
                  body: "This is what I had in mind, thanks.",
                  path: "src/main.rs",
                  line: 80,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "oskar",
              body: "Will test on the Umeå hackerspace's two routers this weekend, they're cabled together. Second approval after that.",
              hoursAfter: 20,
              reactions: [{ emoji: "🙏", by: ["diego"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Send route requests before a route expires",
      author: "ada",
      daysAgo: 5,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description: `When a selected route hasn't been refreshed for 3/4 of its lifetime, ask the neighbours for it with a new Route Request TLV (kind 9) instead of waiting for it to expire. Routers that have a route answer with an update straight away.

This is the follow-up to the retraction fix we talked about last year. Old routers skip kind 9 as unknown, so it's safe to roll out gradually.`,
          hoursAfter: 0,
          commits: [
            {
              message: `Add a route request TLV and send it for expiring routes

A route that hasn't been refreshed for 45 of its 60 seconds triggers a
multicast request. Receivers with a route for the prefix answer with an
update at once.`,
              author: "ada",
              daysAgo: 5,
              changes: {
                "src/packet.rs": [
                  [
                    "    Update { prefix: [u8; 16], plen: u8, seqno: u16, metric: u16, router_id: u64 },\n}",
                    "    Update { prefix: [u8; 16], plen: u8, seqno: u16, metric: u16, router_id: u64 },\n    RouteRequest { prefix: [u8; 16], plen: u8 },\n}",
                  ],
                  [
                    "                    out.extend_from_slice(&router_id.to_be_bytes());\n                }\n",
                    "                    out.extend_from_slice(&router_id.to_be_bytes());\n                }\n                Tlv::RouteRequest { prefix, plen } => {\n                    out.extend_from_slice(&[9, 17, *plen]);\n                    out.extend_from_slice(prefix);\n                }\n",
                  ],
                  [
                    "                4 | 8 => bail!",
                    "                9 if len == 17 => tlvs.push(Tlv::RouteRequest {\n                    plen: v[0],\n                    prefix: v[1..17].try_into()?,\n                }),\n                4 | 8 | 9 => bail!",
                  ],
                ],
                "src/route.rs": [
                  [
                    "    pub fn expire(&mut self, now: Instant) {",
                    `    /// Selected routes that will expire soon unless someone refreshes them.
    pub fn expiring(&self, now: Instant) -> Vec<Prefix> {
        self.routes
            .values()
            .filter(|r| now.duration_since(r.updated) > ROUTE_EXPIRY * 3 / 4)
            .map(|r| r.prefix)
            .collect()
    }

    /// Answer a route request with an update for that prefix, if we have one.
    pub fn answer(&self, prefix: Prefix) -> Option<Packet> {
        let r = self.routes.get(&prefix)?;
        Some(Packet {
            sender: self.router_id,
            tlvs: vec![Tlv::Update {
                prefix: r.prefix.addr,
                plen: r.prefix.len,
                seqno: r.seqno,
                metric: r.metric,
                router_id: r.router_id,
            }],
        })
    }

    pub fn expire(&mut self, now: Instant) {`,
                  ],
                ],
                "src/main.rs": [
                  [
                    "            next_update = now + config.hello_interval() * 4;\n        }\n",
                    `            next_update = now + config.hello_interval() * 4;
            let expiring = table.expiring(now);
            if !expiring.is_empty() {
                let tlvs = expiring
                    .into_iter()
                    .map(|p| Tlv::RouteRequest { prefix: p.addr, plen: p.len })
                    .collect();
                send_all(&socket, &ifindexes, &Packet { sender: config.router_id, tlvs });
            }
        }
`,
                  ],
                  [
                    "                    for tlv in &packet.tlvs {\n",
                    `                    for tlv in &packet.tlvs {
                        if let Tlv::RouteRequest { prefix, plen } = tlv {
                            let prefix = Prefix { addr: *prefix, len: *plen };
                            if let Some(answer) = table.answer(prefix) {
                                send_all(&socket, &ifindexes, &answer);
                            }
                        }
`,
                  ],
                  [
                    "use meshd::route::{RouteTable, INFINITY};",
                    "use meshd::route::{Prefix, RouteTable, INFINITY};",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "felix",
              hoursAfter: 20,
              summary:
                "Nice and small. Two concerns, neither blocking the idea.",
              comments: [
                {
                  body: "This sends requests every update interval for as long as the route stays expiring, i.e. three times before it actually expires. Probably fine, but worth a rate limit so a lost prefix doesn't cause a request storm across 40 routers.",
                  path: "src/main.rs",
                  line: 58,
                  endLine: 65,
                },
                {
                  body: "Answering from the selected route means we may answer with a route *through the requester*. Babel avoids that with split horizon; we probably need it here too, or at least skip routes whose next hop is the sender.",
                  path: "src/route.rs",
                  line: 176,
                },
              ],
            },
          ],
          comments: [
            {
              author: "diego",
              body: "Looking forward to this one, it would cut the outage when the school gateway reboots from ~60 s to a few seconds.",
              hoursAfter: 8,
              reactions: [{ emoji: "👍", by: ["ada"] }],
            },
            {
              author: "ada",
              body: "Good points both. I'll add split horizon for answers and a per-prefix backoff for requests.",
              hoursAfter: 26,
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
      title: "meshd 0.1.0",
      notes: `The first release, running on the Cerro Verde mesh for three weeks.

- Babel-style distance-vector routing with the feasibility condition
- Link cost from ETX, measured from hello loss
- Local prefixes announced from the config file
- Routes installed into the kernel with ip(8), tagged proto 42

The wire format is not stable: run the same version on every router.`,
      author: "diego",
      daysAgo: 296,
      artifacts: [
        { name: "meshd-0.1.0-mipsel-unknown-linux-musl", sizeBytes: 1_084_312 },
        { name: "meshd-0.1.0-aarch64-unknown-linux-musl", sizeBytes: 1_201_640 },
        { name: "meshd-0.1.0.tar.gz", sizeBytes: 21_877 },
      ],
    },
    {
      tag: "v0.2.0",
      at: "v0.2.0",
      title: "meshd 0.2.0",
      notes: `- New control socket (\`routes\`, \`version\`); see docs/control-protocol.md
- Retractions now remove routes straight away (thanks ada)
- Hellos advertise the configured interval (thanks kofi)
- The systemd unit runs meshd as its own user with only CAP_NET_ADMIN

Compatible on the wire with 0.1.x.`,
      author: "diego",
      daysAgo: 203,
      artifacts: [
        { name: "meshd-0.2.0-mipsel-unknown-linux-musl", sizeBytes: 1_139_104 },
        { name: "meshd-0.2.0-aarch64-unknown-linux-musl", sizeBytes: 1_262_288 },
        { name: "meshd-0.2.0.tar.gz", sizeBytes: 26_410 },
      ],
    },
    {
      tag: "v0.3.0",
      at: "v0.3.0",
      title: "meshd 0.3.0",
      notes: `Mostly stability for larger meshes.

- Updates are split to fit the MTU; meshes with more than 46 prefixes no longer lose routes
- Switching next hop needs a margin of 96, which ends the flapping between near-equal paths
- ip(8) is only run when a route changes: CPU on a TL-WR902 dropped from ~15% to ~1%
- Silent neighbours are forgotten after 16 hello intervals
- \`neighbours\` control command for the map (thanks noor)

Upgrade in any order; the wire format is unchanged.`,
      author: "diego",
      daysAgo: 58,
      artifacts: [
        { name: "meshd-0.3.0-mipsel-unknown-linux-musl", sizeBytes: 1_152_960 },
        { name: "meshd-0.3.0-aarch64-unknown-linux-musl", sizeBytes: 1_278_504 },
        { name: "meshd_0.3.0_mipsel_24kc.ipk", sizeBytes: 498_211 },
        { name: "meshd-0.3.0.tar.gz", sizeBytes: 31_045 },
      ],
    },
  ],
};
