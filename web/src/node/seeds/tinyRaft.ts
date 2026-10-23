import type { RepoSeed } from "./types";

const readme = `# tiny-raft

A teaching implementation of the Raft consensus algorithm in Go. It is
written to be read next to the paper, one section at a time, and it is the
code we use in the distributed systems course.

What is in here:

- \`raft/\`: a single-threaded Raft node. It never touches a clock or a
  socket: you feed it ticks and messages, it hands you messages to send.
- \`sim/\`: a deterministic network simulator. It drops, reorders and
  (eventually) partitions messages, all driven by one seed, so a failing
  test fails the same way every time.
- \`docs/notes/\`: the lecture notes that go with each part.

What is not in here: membership changes, log compaction beyond the basics,
a real network transport, or any attempt at being fast. If you want a Raft
for production, this is not it.

## Running the tests

    go test ./...

Each test runs hundreds of seeds. When one fails, the seed is in the
message; rerun just that seed and read the trace.

## Reading order

1. \`raft/raft.go\` and \`raft/election.go\` (week 1)
2. \`raft/log.go\` and \`raft/replication.go\` (week 2)
3. \`sim/network.go\`, then the tests
`;

const license = `MIT License

Copyright (c) 2025 priya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM THE SOFTWARE OR ITS USE.
`;

const goMod = `module example.org/tiny-raft

go 1.22
`;

const gitignore = `cover.out
*.test
/kvdemo
`;

const makefile = `.PHONY: test vet cover

test:
	go test ./...

vet:
	go vet ./...

cover:
	go test -coverprofile=cover.out ./...
	go tool cover -html=cover.out
`;

const changelog = `# Changelog

## Unreleased

- Leader election (§5.2) with the election restriction (§5.4.1)
- Deterministic network simulator in package sim
`;

const raftGo = `// Package raft is a small, single-threaded implementation of the Raft
// consensus algorithm, written to be read alongside the Raft paper ("In
// Search of an Understandable Consensus Algorithm"). Section and figure
// numbers in comments refer to the extended version of that paper.
//
// A Node never touches the network or a clock. The caller feeds it ticks
// and messages and collects the messages it wants to send, which is what
// lets package sim run whole clusters deterministically.
package raft

import "math/rand"

type Role int

const (
	Follower Role = iota
	Candidate
	Leader
)

func (r Role) String() string {
	return [...]string{"follower", "candidate", "leader"}[r]
}

// Config is fixed for the lifetime of a node.
type Config struct {
	ID    int
	Peers []int // every other node in the cluster

	// Timeouts are counted in ticks. The election timeout is drawn from
	// [ElectionTicks, 2*ElectionTicks) every time the timer is reset, so
	// that nodes rarely time out together and split the vote (§5.2).
	ElectionTicks  int
	HeartbeatTicks int
}

type Node struct {
	cfg  Config
	role Role

	// Persistent state on all servers (Figure 2).
	currentTerm uint64
	votedFor    int // -1 if none this term
	log         *Log

	// Volatile state on all servers.
	commitIndex uint64
	lastApplied uint64

	// Volatile state on candidates: who has voted for us this term.
	votes map[int]bool

	// Ticks since the election timer was last reset, and when it fires.
	elapsed  int
	deadline int

	outbox []Message
}

func NewNode(cfg Config) *Node {
	n := &Node{cfg: cfg, votedFor: -1, log: NewLog()}
	n.resetTimer()
	return n
}

func (n *Node) ID() int      { return n.cfg.ID }
func (n *Node) Role() Role   { return n.role }
func (n *Node) Term() uint64 { return n.currentTerm }

// Tick advances the node's clock by one step.
func (n *Node) Tick() {
	n.elapsed++
	switch n.role {
	case Follower, Candidate:
		if n.elapsed >= n.deadline {
			n.startElection()
		}
	}
}

// Step handles one incoming message.
func (n *Node) Step(m Message) {
	// §5.1: a message from a later term means we are behind. Whatever we
	// were, we become a follower in that term before handling it.
	if m.Term > n.currentTerm {
		n.becomeFollower(m.Term)
	}
	switch m.Kind {
	case MsgRequestVote:
		n.handleRequestVote(m)
	case MsgRequestVoteReply:
		n.handleRequestVoteReply(m)
	}
}

// Outbox returns the messages the node wants to send and clears them.
func (n *Node) Outbox() []Message {
	out := n.outbox
	n.outbox = nil
	return out
}

func (n *Node) send(m Message) {
	m.From = n.cfg.ID
	m.Term = n.currentTerm
	n.outbox = append(n.outbox, m)
}

func (n *Node) becomeFollower(term uint64) {
	n.role = Follower
	n.currentTerm = term
	n.votedFor = -1
	n.resetTimer()
}

func (n *Node) resetTimer() {
	n.elapsed = 0
	n.deadline = n.cfg.ElectionTicks + rand.Intn(n.cfg.ElectionTicks)
}

// quorum is the smallest majority of the whole cluster, ourselves included.
func (n *Node) quorum() int { return (len(n.cfg.Peers)+1)/2 + 1 }
`;

const rpcGo = `package raft

// MsgKind says which of the Raft RPCs a message carries. Requests and
// replies are separate messages because the simulator delivers them
// independently and in any order, just like a real network would.
type MsgKind int

const (
	MsgRequestVote MsgKind = iota
	MsgRequestVoteReply
)

// Message is one RPC request or reply travelling between two nodes. Only
// the fields relevant to Kind are set.
type Message struct {
	Kind MsgKind
	From int
	To   int
	Term uint64

	// RequestVote
	LastLogIndex uint64
	LastLogTerm  uint64

	// RequestVote reply
	VoteGranted bool
}
`;

const electionGo = `package raft

// startElection is §5.2: a follower whose election timer fires becomes a
// candidate, increments its term, votes for itself and asks everyone else
// for their vote.
func (n *Node) startElection() {
	n.role = Candidate
	n.currentTerm++
	n.votedFor = n.cfg.ID
	n.votes = map[int]bool{n.cfg.ID: true}
	n.resetTimer()

	for _, peer := range n.cfg.Peers {
		n.send(Message{
			Kind:         MsgRequestVote,
			To:           peer,
			LastLogIndex: n.log.LastIndex(),
			LastLogTerm:  n.log.LastTerm(),
		})
	}
}

// handleRequestVote decides whether to grant a vote. Two rules, both from
// Figure 2: we vote at most once per term, and only for a candidate whose
// log is at least as up-to-date as ours (§5.4.1, the election restriction).
func (n *Node) handleRequestVote(m Message) {
	grant := m.Term == n.currentTerm &&
		(n.votedFor == -1 || n.votedFor == m.From) &&
		n.candidateUpToDate(m.LastLogIndex, m.LastLogTerm)
	if grant {
		n.votedFor = m.From
	}
	n.send(Message{Kind: MsgRequestVoteReply, To: m.From, VoteGranted: grant})
}

// candidateUpToDate compares logs the way §5.4.1 describes: the log whose
// last entry has the later term is more up-to-date; if the terms are equal,
// the longer log is.
func (n *Node) candidateUpToDate(lastIndex, lastTerm uint64) bool {
	if lastTerm != n.log.LastTerm() {
		return lastTerm > n.log.LastTerm()
	}
	return lastIndex >= n.log.LastIndex()
}

func (n *Node) handleRequestVoteReply(m Message) {
	if n.role != Candidate || m.Term != n.currentTerm {
		return // a reply to an election we are no longer running
	}
	if m.VoteGranted {
		n.votes[m.From] = true
	}
	if len(n.votes) >= n.quorum() {
		n.becomeLeader()
	}
}

func (n *Node) becomeLeader() {
	n.role = Leader
}
`;

const logGo = `package raft

// Entry is one command in the replicated log. Indexes start at 1; index 0
// is a sentinel that every log contains, which saves a lot of
// "if len(log) == 0" special cases in the RPC handlers.
type Entry struct {
	Term    uint64
	Index   uint64
	Command []byte
}

// Log holds the entries a node knows about. Entries are never removed
// from the middle: a follower only ever truncates a suffix that conflicts
// with its leader's log.
type Log struct {
	entries []Entry // entries[0] is the sentinel
}

func NewLog() *Log {
	return &Log{entries: []Entry{{Term: 0, Index: 0}}}
}

func (l *Log) LastIndex() uint64 { return l.entries[len(l.entries)-1].Index }
func (l *Log) LastTerm() uint64  { return l.entries[len(l.entries)-1].Term }

// Term returns the term of the entry at index, and false if the log does
// not contain that index.
func (l *Log) Term(index uint64) (uint64, bool) {
	if index > l.LastIndex() {
		return 0, false
	}
	return l.entries[index].Term, true
}

// Slice returns a copy of the entries from lo (inclusive) to the end.
func (l *Log) Slice(lo uint64) []Entry {
	if lo > l.LastIndex() {
		return nil
	}
	out := make([]Entry, len(l.entries[lo:]))
	copy(out, l.entries[lo:])
	return out
}

// Append adds entries, first truncating any suffix that conflicts with
// them. This is the receiver side of AppendEntries, steps 3 and 4 in
// Figure 2. Entries we already have are skipped, so a delayed duplicate
// of an old request can never truncate newer entries.
func (l *Log) Append(entries []Entry) {
	for i, e := range entries {
		if t, ok := l.Term(e.Index); ok && t == e.Term {
			continue
		}
		l.entries = append(l.entries[:e.Index], entries[i:]...)
		return
	}
}
`;

const logGoSnap = `package raft

// Entry is one command in the replicated log. Indexes start at 1; index 0
// is a sentinel that every log contains, which saves a lot of
// "if len(log) == 0" special cases in the RPC handlers.
type Entry struct {
	Term    uint64
	Index   uint64
	Command []byte
}

// Log holds the entries a node knows about. Entries are never removed
// from the middle: a follower only ever truncates a suffix that conflicts
// with its leader's log, and a snapshot only ever removes a prefix.
type Log struct {
	// entries[0] is the sentinel. Once a snapshot has been taken it
	// stands for the last entry the snapshot covers, so its Index is no
	// longer 0 and every lookup has to subtract it.
	entries []Entry
}

func NewLog() *Log {
	return &Log{entries: []Entry{{Term: 0, Index: 0}}}
}

func (l *Log) first() uint64     { return l.entries[0].Index }
func (l *Log) LastIndex() uint64 { return l.entries[len(l.entries)-1].Index }
func (l *Log) LastTerm() uint64  { return l.entries[len(l.entries)-1].Term }

// Term returns the term of the entry at index, and false if the log does
// not contain that index, either because it is too new or because it has
// been compacted into a snapshot.
func (l *Log) Term(index uint64) (uint64, bool) {
	if index < l.first() || index > l.LastIndex() {
		return 0, false
	}
	return l.entries[index-l.first()].Term, true
}

// Slice returns a copy of the entries from lo (inclusive) to the end.
// Asking for compacted entries is a bug in the caller.
func (l *Log) Slice(lo uint64) []Entry {
	if lo > l.LastIndex() {
		return nil
	}
	if lo <= l.first() {
		panic("raft: Slice of compacted entries")
	}
	src := l.entries[lo-l.first():]
	out := make([]Entry, len(src))
	copy(out, src)
	return out
}

// Append adds entries, first truncating any suffix that conflicts with
// them. This is the receiver side of AppendEntries, steps 3 and 4 in
// Figure 2. Entries we already have are skipped, so a delayed duplicate
// of an old request can never truncate newer entries.
func (l *Log) Append(entries []Entry) {
	for i, e := range entries {
		if e.Index <= l.first() {
			continue // already covered by our snapshot
		}
		if t, ok := l.Term(e.Index); ok && t == e.Term {
			continue
		}
		l.entries = append(l.entries[:e.Index-l.first()], entries[i:]...)
		return
	}
}

// Compact discards every entry up to and including index, which is now
// covered by a snapshot. The entry at index becomes the new sentinel.
func (l *Log) Compact(index, term uint64) {
	if index <= l.first() {
		return
	}
	l.entries = []Entry{{Term: term, Index: index}}
}
`;

const replicationGo = `package raft

// Propose appends a command to the leader's log and returns its index. It
// returns false on any node that is not the leader; the caller (a client,
// or a test) has to go and find the leader instead.
func (n *Node) Propose(cmd []byte) (uint64, bool) {
	if n.role != Leader {
		return 0, false
	}
	index := n.log.LastIndex() + 1
	n.log.Append([]Entry{{Term: n.currentTerm, Index: index, Command: cmd}})
	n.matchIndex[n.cfg.ID] = index
	n.broadcastAppend()
	return index, true
}

// becomeLeader initialises the leader state from Figure 2: nextIndex
// optimistically points just past our own log, matchIndex starts at 0
// because we know nothing about the followers yet.
func (n *Node) becomeLeader() {
	n.role = Leader
	n.nextIndex = map[int]uint64{}
	n.matchIndex = map[int]uint64{}
	for _, peer := range n.cfg.Peers {
		n.nextIndex[peer] = n.log.LastIndex() + 1
		n.matchIndex[peer] = 0
	}
	n.matchIndex[n.cfg.ID] = n.log.LastIndex()
	n.broadcastAppend()
}

func (n *Node) broadcastAppend() {
	n.elapsed = 0
	for _, peer := range n.cfg.Peers {
		n.sendAppend(peer)
	}
}

// sendAppend sends peer every entry from nextIndex onwards. When there is
// nothing new to send, this is the heartbeat.
func (n *Node) sendAppend(peer int) {
	prev := n.nextIndex[peer] - 1
	prevTerm, _ := n.log.Term(prev)
	n.send(Message{
		Kind:         MsgAppendEntries,
		To:           peer,
		PrevLogIndex: prev,
		PrevLogTerm:  prevTerm,
		Entries:      n.log.Slice(prev + 1),
		LeaderCommit: n.commitIndex,
	})
}

// handleAppendEntries is the receiver implementation from Figure 2.
func (n *Node) handleAppendEntries(m Message) {
	if m.Term < n.currentTerm {
		n.send(Message{Kind: MsgAppendEntriesReply, To: m.From, Success: false})
		return
	}
	// There is a legitimate leader for this term: candidates give up, and
	// everyone resets their election timer.
	n.role = Follower
	n.resetTimer()

	if t, ok := n.log.Term(m.PrevLogIndex); !ok || t != m.PrevLogTerm {
		n.send(Message{Kind: MsgAppendEntriesReply, To: m.From, Success: false})
		return
	}
	n.log.Append(m.Entries)
	last := m.PrevLogIndex + uint64(len(m.Entries))
	if m.LeaderCommit > n.commitIndex {
		n.commitIndex = min(m.LeaderCommit, last)
	}
	n.send(Message{Kind: MsgAppendEntriesReply, To: m.From, Success: true, MatchIndex: last})
}

func (n *Node) handleAppendEntriesReply(m Message) {
	if n.role != Leader {
		return
	}
	if !m.Success {
		// Back off one entry at a time. §5.3 sketches a faster scheme
		// using the term of the conflicting entry: that is exercise 2.3.
		if n.nextIndex[m.From] > 1 {
			n.nextIndex[m.From]--
		}
		n.sendAppend(m.From)
		return
	}
	if m.MatchIndex > n.matchIndex[m.From] {
		n.matchIndex[m.From] = m.MatchIndex
		n.nextIndex[m.From] = m.MatchIndex + 1
	}
	n.advanceCommit()
}

// advanceCommit moves commitIndex to the highest index that is stored on
// a majority of servers.
func (n *Node) advanceCommit() {
	for idx := n.log.LastIndex(); idx > n.commitIndex; idx-- {
		count := 0
		for _, match := range n.matchIndex {
			if match >= idx {
				count++
			}
		}
		if count >= n.quorum() {
			n.commitIndex = idx
			return
		}
	}
}

// Committed returns the entries that have been committed since the last
// call, in order, and marks them applied.
func (n *Node) Committed() []Entry {
	if n.commitIndex <= n.lastApplied {
		return nil
	}
	out := n.log.Slice(n.lastApplied + 1)[:n.commitIndex-n.lastApplied]
	n.lastApplied = n.commitIndex
	return out
}
`;

const networkGo = `// Package sim runs a cluster of raft.Nodes on a simulated network. Nothing
// in here uses goroutines, wall-clock time or the global random source, so
// a test that fails once fails the same way every time it is run with the
// same seed.
package sim

import (
	"math/rand"

	"example.org/tiny-raft/raft"
)

type Cluster struct {
	Nodes []*raft.Node
	Rand  *rand.Rand

	// DropRate is the probability that any one message is lost.
	DropRate float64

	inflight []raft.Message
	now      int
}

func NewCluster(size int, seed int64) *Cluster {
	c := &Cluster{Rand: rand.New(rand.NewSource(seed))}
	for id := 0; id < size; id++ {
		var peers []int
		for p := 0; p < size; p++ {
			if p != id {
				peers = append(peers, p)
			}
		}
		c.Nodes = append(c.Nodes, raft.NewNode(raft.Config{
			ID:             id,
			Peers:          peers,
			ElectionTicks:  10,
			HeartbeatTicks: 3,
		}))
	}
	return c
}

// Step advances the simulation by one tick: every node ticks, then the
// messages that were in flight are delivered and the replies they
// produce are queued for the next step.
func (c *Cluster) Step() {
	c.now++
	for _, n := range c.Nodes {
		n.Tick()
		c.inflight = append(c.inflight, n.Outbox()...)
	}
	batch := c.inflight
	c.inflight = nil
	for _, m := range batch {
		if c.Rand.Float64() < c.DropRate {
			continue
		}
		c.Nodes[m.To].Step(m)
		c.inflight = append(c.inflight, c.Nodes[m.To].Outbox()...)
	}
}

// Run steps the cluster n times.
func (c *Cluster) Run(n int) {
	for i := 0; i < n; i++ {
		c.Step()
	}
}

// Leader returns the node that believes it leads the highest term, or nil
// if no node thinks it is leader.
func (c *Cluster) Leader() *raft.Node {
	var leader *raft.Node
	for _, n := range c.Nodes {
		if n.Role() == raft.Leader && (leader == nil || n.Term() > leader.Term()) {
			leader = n
		}
	}
	return leader
}
`;

const electionTestGo = `package raft_test

import (
	"testing"

	"example.org/tiny-raft/raft"
	"example.org/tiny-raft/sim"
)

func TestElectsOneLeader(t *testing.T) {
	c := sim.NewCluster(3, 1)
	c.Run(50)
	leaders := 0
	for _, n := range c.Nodes {
		if n.Role() == raft.Leader {
			leaders++
		}
	}
	if leaders != 1 {
		t.Fatalf("got %d leaders after 50 ticks, want 1", leaders)
	}
}

// Election Safety (Figure 3): at most one leader per term. Checked after
// every single step, across many seeds, on a lossy network.
func TestElectionSafety(t *testing.T) {
	for seed := int64(0); seed < 200; seed++ {
		c := sim.NewCluster(5, seed)
		c.DropRate = 0.2
		for step := 0; step < 300; step++ {
			c.Step()
			leaders := map[uint64]int{}
			for _, n := range c.Nodes {
				if n.Role() != raft.Leader {
					continue
				}
				if other, ok := leaders[n.Term()]; ok {
					t.Fatalf("seed %d step %d: nodes %d and %d both lead term %d",
						seed, step, other, n.ID(), n.Term())
				}
				leaders[n.Term()] = n.ID()
			}
		}
	}
}
`;

const notesElection = `# Week 1: leader election

Raft splits consensus into three smaller problems. This week is the first
one: making sure that at any time there is at most one leader per term,
and that a new one is chosen soon after the old one disappears.

## Terms

A term is a number that only goes up. Think of it as a logical clock that
every message carries. If you ever see a message with a bigger term than
yours, you are out of date: adopt the term and become a follower. That one
rule (§5.1) resolves most of the "but what if two nodes both think..."
questions you will have this week.

## The election timer

Followers expect to hear from a leader regularly. If they don't hear
anything for an election timeout, they assume the leader is gone and stand
for election. The timeout is random, so that usualy one node times out
first and wins before anyone else even starts.

Read \`Tick\` in \`raft/raft.go\` and \`startElection\` in \`raft/election.go\`.

## Voting

Each node votes at most once per term, first come first served. A
candidate that collects votes from a majority (including its own) becomes
leader. A majority is what makes this safe: two majorities of the same
cluster always overlap, and the node in the overlap only voted once.

Next week we will add the second voting rule, the election restriction,
and see why it is needed.
`;

const notesReplication = `# Week 2: log replication

The leader accepts commands, appends them to its log, and sends them to
followers with AppendEntries. Once an entry is stored on a majority it is
committed, and it can be applied to the state machine.

## The consistency check

Every AppendEntries carries the index and term of the entry just before
the new ones (\`PrevLogIndex\`, \`PrevLogTerm\`). A follower only accepts the
request if its own log has a matching entry there. By induction, this
means that if two logs have an entry with the same index and term, the
logs are identical up to that point (the Log Matching Property).

## nextIndex and matchIndex

The leader keeps two numbers per follower:

- \`nextIndex\`: the index of the next entry to send. It starts just past
  the end of the leader's log and moves back when the consistency check
  fails.
- \`matchIndex\`: the highest index the leader knows is replicated on that
  follower. It starts at the end of the leader's log and only moves forward.

They look similar, but \`nextIndex\` is a guess and \`matchIndex\` is a fact.
Commit decisions are only ever made from \`matchIndex\`.

## Exercises

See \`docs/exercises.md\`.
`;

const notesSnapshots = `# Week 3: snapshots

A log that grows forever is not a log anyone can run in production. §7 of
the paper adds snapshots: the application serialises its state at some
applied index, and everything up to that index can be thrown away.

## What changes in the code

- \`Log\` gains an offset. The sentinel entry at \`entries[0]\` now stands for
  the last entry covered by the snapshot, and every index lookup subtracts
  it. Read \`raft/log.go\` carefully, this is where off-by-one bugs live.
- When a follower is so far behind that the entries it needs are gone, the
  leader sends \`InstallSnapshot\` instead of \`AppendEntries\`.
- The application has to notice a pending snapshot and restore from it.

## Things to think about

1. Why must a node only snapshot entries that are already applied?
2. A follower receives a snapshot covering index 50, but its log already
   has entries up to 60 that match. What should it keep?
3. Could a leader ever need to send a snapshot to a node that is ahead of
   it? (No. Why not?)
`;

const exercises = `# Exercises

Each exercise has tests in a branch called \`exercise/N.M\` that fail until
you have done it. Please don't open patches with solutions: other students
read this repository too.

## Week 1

1.1 Add a \`PreCandidate\` role that asks for votes without incrementing the
    term. When does it help?
1.2 Write a test that fails if two candidates ever both get a majority in
    the same term, even for a single step.

## Week 2

2.1 Make the leader append a no-op entry when it is elected. Which test
    starts passing, and why?
2.2 Batch entries: limit AppendEntries to 64 entries per message.
2.3 Implement the faster log backtracking sketched at the end of §5.3,
    using the conflicting term rather than one index at a time.

## Week 3

3.1 Make the kvdemo take a snapshot every 100 applied entries.
3.2 Restart a node from its \`MemoryStorage\` and snapshot, and check it
    catches up without a full replay.
`;

const replicationTestGo = `package raft_test

import (
	"testing"

	"example.org/tiny-raft/sim"
)

func TestReplicatesToAll(t *testing.T) {
	c := sim.NewCluster(3, 7)
	c.Run(50)
	leader := c.Leader()
	if leader == nil {
		t.Fatal("no leader after 50 ticks")
	}
	for i := 0; i < 5; i++ {
		leader.Propose([]byte{byte(i)})
	}
	c.Run(20)
	for _, n := range c.Nodes {
		if got := len(n.Committed()); got != 5 {
			t.Errorf("node %d applied %d entries, want 5", n.ID(), got)
		}
	}
}

func TestLossyNetworkStillCommits(t *testing.T) {
	for seed := int64(0); seed < 100; seed++ {
		c := sim.NewCluster(5, seed)
		c.DropRate = 0.3
		c.Run(100)
		leader := c.Leader()
		if leader == nil {
			t.Fatalf("seed %d: no leader after 100 ticks", seed)
		}
		index, _ := leader.Propose([]byte("x"))
		c.Run(200)
		committed := 0
		for _, n := range c.Nodes {
			for _, e := range n.Committed() {
				if e.Index == index {
					committed++
				}
			}
		}
		if committed < 3 {
			t.Fatalf("seed %d: entry %d applied on %d nodes, want a majority", seed, index, committed)
		}
	}
}
`;

const figure8Test = `

// TestFigure8 replays the shape of Figure 8: leaders come and go while
// entries are only partly replicated. A leader must never commit an entry
// from an earlier term just by counting replicas, or two nodes end up
// applying different commands at the same index.
func TestFigure8(t *testing.T) {
	for seed := int64(0); seed < 100; seed++ {
		c := sim.NewCluster(5, seed)
		c.DropRate = 0.1
		applied := make([][]raft.Entry, 5)
		for round := 0; round < 30; round++ {
			if l := c.Leader(); l != nil {
				l.Propose([]byte{byte(round)})
				if c.Rand.Intn(2) == 0 {
					c.Isolate(l.ID())
				}
			}
			c.Run(15)
			c.Heal()
			c.Run(15)
			for _, n := range c.Nodes {
				applied[n.ID()] = append(applied[n.ID()], n.Committed()...)
			}
		}
		checkPrefixes(t, seed, applied)
	}
}

// checkPrefixes fails if two nodes applied different entries at the same
// index (State Machine Safety, §5.4.3).
func checkPrefixes(t *testing.T, seed int64, applied [][]raft.Entry) {
	t.Helper()
	for i := range applied {
		for j := range applied {
			for k := 0; k < len(applied[i]) && k < len(applied[j]); k++ {
				if applied[i][k].Term != applied[j][k].Term {
					t.Fatalf("seed %d: nodes %d and %d applied different entries at index %d",
						seed, i, j, applied[i][k].Index)
				}
			}
		}
	}
}
`;

const storageGo = `package raft

// Storage keeps the state Figure 2 calls persistent: currentTerm, votedFor
// and the log. A real implementation must have written it to disk, and
// fsynced, before Save returns.
type Storage interface {
	Save(term uint64, votedFor int, entries []Entry)
	Load() (term uint64, votedFor int, entries []Entry, ok bool)
}

// MemoryStorage is the Storage the simulator uses. It outlives the Node it
// belongs to, so a simulated crash is just building a new Node with the
// same MemoryStorage.
type MemoryStorage struct {
	term     uint64
	votedFor int
	entries  []Entry
	saved    bool
}

func (s *MemoryStorage) Save(term uint64, votedFor int, entries []Entry) {
	s.term, s.votedFor, s.saved = term, votedFor, true
	s.entries = append(s.entries[:0], entries...)
}

func (s *MemoryStorage) Load() (uint64, int, []Entry, bool) {
	return s.term, s.votedFor, append([]Entry(nil), s.entries...), s.saved
}

// persist writes everything, every time. That would be far too slow in a
// real system, but it is obviously correct, which matters more here.
func (n *Node) persist() {
	if n.cfg.Storage != nil {
		n.cfg.Storage.Save(n.currentTerm, n.votedFor, n.log.entries)
	}
}

func (n *Node) restore() {
	if n.cfg.Storage == nil {
		return
	}
	term, votedFor, entries, ok := n.cfg.Storage.Load()
	if !ok {
		return
	}
	n.currentTerm, n.votedFor = term, votedFor
	n.log.entries = entries
}
`;

const snapshotGo = `package raft

// Snapshot captures the application's state machine as of LastIndex, so
// the log up to that point can be discarded (§7). The node never looks
// inside Data; the application produces it and restores from it.
type Snapshot struct {
	LastIndex uint64
	LastTerm  uint64
	Data      []byte
}

// TakeSnapshot is called by the application once it has applied
// everything up to index and serialised its state into data.
func (n *Node) TakeSnapshot(index uint64, data []byte) {
	if index <= n.snapshot.LastIndex || index > n.lastApplied {
		return
	}
	term, _ := n.log.Term(index)
	n.snapshot = Snapshot{LastIndex: index, LastTerm: term, Data: data}
	n.log.Compact(index, term)
}

// PendingSnapshot returns a snapshot received from the leader that the
// application has not restored yet, and forgets it.
func (n *Node) PendingSnapshot() *Snapshot {
	s := n.pendingSnapshot
	n.pendingSnapshot = nil
	return s
}

func (n *Node) sendSnapshot(peer int) {
	n.send(Message{Kind: MsgInstallSnapshot, To: peer, Snapshot: n.snapshot})
}

func (n *Node) handleInstallSnapshot(m Message) {
	if m.Term < n.currentTerm {
		n.send(Message{Kind: MsgAppendEntriesReply, To: m.From, Success: false})
		return
	}
	n.role = Follower
	n.resetTimer()

	s := m.Snapshot
	if s.LastIndex <= n.commitIndex {
		// Old news: we have already committed everything it covers.
		n.send(Message{Kind: MsgAppendEntriesReply, To: m.From, Success: true, MatchIndex: n.commitIndex})
		return
	}
	n.log.Compact(s.LastIndex, s.LastTerm)
	n.snapshot = s
	n.pendingSnapshot = &s
	n.commitIndex = s.LastIndex
	n.lastApplied = s.LastIndex
	n.send(Message{Kind: MsgAppendEntriesReply, To: m.From, Success: true, MatchIndex: s.LastIndex})
}
`;

const snapshotTestGo = `package raft_test

import (
	"testing"

	"example.org/tiny-raft/sim"
)

// A follower that was cut off while the leader compacted its log has to
// be brought up to date with InstallSnapshot, not AppendEntries.
func TestLaggingFollowerGetsSnapshot(t *testing.T) {
	c := sim.NewCluster(3, 11)
	c.Run(50)
	leader := c.Leader()
	if leader == nil {
		t.Fatal("no leader after 50 ticks")
	}
	lagging := (leader.ID() + 1) % 3
	c.Isolate(lagging)
	for i := 0; i < 20; i++ {
		leader.Propose([]byte{byte(i)})
		c.Run(5)
	}
	applied := leader.Committed()
	leader.TakeSnapshot(applied[len(applied)-1].Index, []byte("state"))
	c.Heal()
	c.Run(30)

	s := c.Nodes[lagging].PendingSnapshot()
	if s == nil || string(s.Data) != "state" {
		t.Fatalf("node %d did not receive the snapshot", lagging)
	}
}
`;

const logTestGo = `package raft

import "testing"

func TestCompactKeepsSuffix(t *testing.T) {
	l := NewLog()
	for i := uint64(1); i <= 5; i++ {
		l.Append([]Entry{{Term: 1, Index: i}})
	}
	l.Compact(3, 1)
	if l.LastIndex() != 5 {
		t.Fatalf("LastIndex = %d after compacting to 3, want 5", l.LastIndex())
	}
	if _, ok := l.Term(2); ok {
		t.Fatal("entry 2 should have been compacted")
	}
}

func TestCompactConflictDropsEverything(t *testing.T) {
	l := NewLog()
	for i := uint64(1); i <= 5; i++ {
		l.Append([]Entry{{Term: 1, Index: i}})
	}
	l.Compact(4, 2)
	if l.LastIndex() != 4 || l.LastTerm() != 2 {
		t.Fatalf("got last %d/%d, want 4/2", l.LastIndex(), l.LastTerm())
	}
}
`;

const traceGo = String.raw`package sim

import (
	"fmt"
	"io"

	"example.org/tiny-raft/raft"
)

// Trace is a record of every message the simulator delivered, in order.
// When a test fails, write it out and read it next to the paper: it is
// usually obvious which step went wrong.
type Trace struct {
	events []event
}

type event struct {
	tick int
	msg  raft.Message
}

func (t *Trace) record(tick int, m raft.Message) {
	if t == nil {
		return
	}
	t.events = append(t.events, event{tick, m})
}

// WriteTo writes one line per delivered message.
func (t *Trace) WriteTo(w io.Writer) (int64, error) {
	var total int64
	for _, e := range t.events {
		n, err := fmt.Fprintf(w, "%5d  %d -> %d  t%-3d %s\n",
			e.tick, e.msg.From, e.msg.To, e.msg.Term, describe(e.msg))
		total += int64(n)
		if err != nil {
			return total, err
		}
	}
	return total, nil
}

func describe(m raft.Message) string {
	switch m.Kind {
	case raft.MsgRequestVote:
		return fmt.Sprintf("RequestVote last=%d/%d", m.LastLogIndex, m.LastLogTerm)
	case raft.MsgRequestVoteReply:
		return fmt.Sprintf("RequestVoteReply granted=%v", m.VoteGranted)
	case raft.MsgAppendEntries:
		return fmt.Sprintf("AppendEntries prev=%d/%d n=%d commit=%d",
			m.PrevLogIndex, m.PrevLogTerm, len(m.Entries), m.LeaderCommit)
	case raft.MsgAppendEntriesReply:
		return fmt.Sprintf("AppendEntriesReply ok=%v match=%d", m.Success, m.MatchIndex)
	case raft.MsgInstallSnapshot:
		return fmt.Sprintf("InstallSnapshot last=%d/%d", m.Snapshot.LastIndex, m.Snapshot.LastTerm)
	}
	return fmt.Sprintf("kind %d", m.Kind)
}
`;

const kvdemoGo = String.raw`// kvdemo runs a five-node cluster in the simulator and uses it as a tiny
// replicated key-value store. It is the program from lecture 4: run it
// before reading the code, to see the pieces working together.
package main

import (
	"fmt"
	"strings"

	"example.org/tiny-raft/sim"
)

func main() {
	c := sim.NewCluster(5, 42)
	stores := make([]map[string]string, len(c.Nodes))
	for i := range stores {
		stores[i] = map[string]string{}
	}
	apply := func() {
		for i, n := range c.Nodes {
			for _, e := range n.Committed() {
				k, v, _ := strings.Cut(string(e.Command), "=")
				stores[i][k] = v
			}
		}
	}

	c.Run(40)
	leader := c.Leader()
	fmt.Printf("node %d leads term %d\n", leader.ID(), leader.Term())

	for _, kv := range []string{"colour=blue", "size=3", "colour=green"} {
		leader.Propose([]byte(kv))
		c.Run(10)
		apply()
	}

	fmt.Printf("isolating node %d\n", leader.ID())
	c.Isolate(leader.ID())
	c.Run(60)
	apply()
	next := c.Leader()
	fmt.Printf("node %d leads term %d\n", next.ID(), next.Term())
	next.Propose([]byte("size=4"))
	c.Heal()
	c.Run(30)
	apply()

	for i, s := range stores {
		fmt.Printf("node %d: colour=%s size=%s\n", i, s["colour"], s["size"])
	}
}
`;

const changelog010 = `# Changelog

## 0.1.0

The version used for the spring course.

- Leader election (§5.2) with the election restriction (§5.4.1)
- Log replication with AppendEntries, one-entry-at-a-time backtracking
- Commit rule only counts replicas for entries from the current term (§5.4.2)
- Deterministic network simulator: message loss, random delivery order,
  isolating nodes and healing the network
- Election timeouts seeded per node, so every test run is reproducible
`;

const changelog020 = `# Changelog

## 0.2.0

The version for the autumn course. Week 3 is new.

- Snapshots and InstallSnapshot (§7)
- \`Storage\` interface and an in-memory implementation, so tests can
  crash and restart nodes
- \`sim.Trace\` records every delivered message for debugging failing seeds
- \`cmd/kvdemo\`, the replicated key-value store from lecture 4
- \`make race\` runs the tests under the race detector
- Fixed: a leader could step down or skip entries after a stale
  AppendEntries reply from an earlier term
- Fixed: compacting the log discarded entries after the snapshot point
- Changed: followers reset their election timer only when they grant a
  vote, not on every RequestVote they see

## 0.1.0

The version used for the spring course.

- Leader election (§5.2) with the election restriction (§5.4.1)
- Log replication with AppendEntries, one-entry-at-a-time backtracking
- Commit rule only counts replicas for entries from the current term (§5.4.2)
- Deterministic network simulator: message loss, random delivery order,
  isolating nodes and healing the network
- Election timeouts seeded per node, so every test run is reproducible
`;

const readIndexGo = `package raft

// Serving a read from the leader's state machine without any checks can
// return stale data: the node may have been replaced by a new leader and
// not know it yet (§8). ReadIndex makes reads linearizable without writing
// them to the log:
//
//  1. Remember the current commitIndex as the read index.
//  2. Confirm we are still leader by hearing from a majority.
//  3. Wait until lastApplied reaches the read index, then serve the read.
type readRequest struct {
	id    uint64
	index uint64
	acks  map[int]bool
}

// ReadIndex starts a read with the caller's id. It returns false if this
// node is not the leader.
func (n *Node) ReadIndex(id uint64) bool {
	if n.role != Leader {
		return false
	}
	n.reads = append(n.reads, &readRequest{
		id:    id,
		index: n.commitIndex,
		acks:  map[int]bool{n.cfg.ID: true},
	})
	n.broadcastAppend()
	return true
}

// ackReads records that peer has answered one of our heartbeats.
func (n *Node) ackReads(peer int) {
	for _, r := range n.reads {
		r.acks[peer] = true
	}
}

// ReadyReads returns the ids of reads that are now safe to serve.
func (n *Node) ReadyReads() []uint64 {
	var ready []uint64
	keep := n.reads[:0]
	for _, r := range n.reads {
		if len(r.acks) >= n.quorum() && n.lastApplied >= r.index {
			ready = append(ready, r.id)
		} else {
			keep = append(keep, r)
		}
	}
	n.reads = keep
	return ready
}
`;

const readIndexGoV2 = `package raft

// Serving a read from the leader's state machine without any checks can
// return stale data: the node may have been replaced by a new leader and
// not know it yet (§8). ReadIndex makes reads linearizable without writing
// them to the log:
//
//  1. Remember the current commitIndex as the read index.
//  2. Start a new heartbeat round and wait for a majority to answer it.
//     Replies to earlier rounds prove nothing about now.
//  3. Wait until lastApplied reaches the read index, then serve the read.
//
// This relies on the leader having committed an entry from its own term,
// otherwise its commitIndex can be behind. Until the no-op-on-election
// patch lands, reads simply wait for that.
type readRequest struct {
	id    uint64
	index uint64
	round uint64
	acks  map[int]bool
}

// ReadIndex starts a read with the caller's id. It returns false if this
// node is not the leader.
func (n *Node) ReadIndex(id uint64) bool {
	if n.role != Leader {
		return false
	}
	n.broadcastAppend()
	n.reads = append(n.reads, &readRequest{
		id:    id,
		index: n.commitIndex,
		round: n.round,
		acks:  map[int]bool{n.cfg.ID: true},
	})
	return true
}

// ackReads records that peer has answered heartbeat round.
func (n *Node) ackReads(peer int, round uint64) {
	for _, r := range n.reads {
		if round >= r.round {
			r.acks[peer] = true
		}
	}
}

// ReadyReads returns the ids of reads that are now safe to serve.
func (n *Node) ReadyReads() []uint64 {
	var ready []uint64
	keep := n.reads[:0]
	for _, r := range n.reads {
		if n.ownTermCommitted() && len(r.acks) >= n.quorum() && n.lastApplied >= r.index {
			ready = append(ready, r.id)
		} else {
			keep = append(keep, r)
		}
	}
	n.reads = keep
	return ready
}

func (n *Node) ownTermCommitted() bool {
	t, ok := n.log.Term(n.commitIndex)
	return ok && t == n.currentTerm
}
`;

const prevoteGo = `package raft

// Pre-vote: before starting a real election, a node asks whether it could
// win one. A node that was partitioned away keeps timing out and bumping
// its term; without pre-vote it comes back with a huge term and forces a
// perfectly healthy leader to step down.

func (n *Node) startPreVote() {
	n.role = PreCandidate
	n.votes = map[int]bool{n.cfg.ID: true}
	n.resetTimer()
	for _, peer := range n.cfg.Peers {
		n.send(Message{
			Kind:         MsgPreVote,
			To:           peer,
			Term:         n.currentTerm + 1,
			LastLogIndex: n.log.LastIndex(),
			LastLogTerm:  n.log.LastTerm(),
		})
	}
}

// handlePreVote grants a pre-vote if we would vote for this candidate in
// the next term and we have not heard from a leader recently.
func (n *Node) handlePreVote(m Message) {
	grant := m.Term > n.currentTerm &&
		n.candidateUpToDate(m.LastLogIndex, m.LastLogTerm)
	n.send(Message{Kind: MsgPreVoteReply, To: m.From, VoteGranted: grant})
}

func (n *Node) handlePreVoteReply(m Message) {
	if n.role != PreCandidate {
		return
	}
	if m.VoteGranted {
		n.votes[m.From] = true
	}
	if len(n.votes) >= n.quorum() {
		n.startElection()
	}
}
`;

const prevoteGoV2 = `package raft

// Pre-vote: before starting a real election, a node asks whether it could
// win one. A node that was partitioned away keeps timing out and bumping
// its term; without pre-vote it comes back with a huge term and forces a
// perfectly healthy leader to step down.
//
// Pre-vote messages carry the term the candidate would use (currentTerm+1)
// but nobody adopts it: Step skips the usual "newer term" rule for them.

func (n *Node) startPreVote() {
	n.role = PreCandidate
	n.votes = map[int]bool{n.cfg.ID: true}
	n.resetTimer()
	for _, peer := range n.cfg.Peers {
		n.outbox = append(n.outbox, Message{
			Kind:         MsgPreVote,
			From:         n.cfg.ID,
			To:           peer,
			Term:         n.currentTerm + 1,
			LastLogIndex: n.log.LastIndex(),
			LastLogTerm:  n.log.LastTerm(),
		})
	}
}

// handlePreVote grants a pre-vote if we would vote for this candidate in
// the next term and we have not heard from a leader recently.
func (n *Node) handlePreVote(m Message) {
	heardFromLeader := n.role == Leader ||
		(n.role == Follower && n.elapsed < n.cfg.ElectionTicks)
	grant := m.Term > n.currentTerm &&
		!heardFromLeader &&
		n.candidateUpToDate(m.LastLogIndex, m.LastLogTerm)
	n.outbox = append(n.outbox, Message{
		Kind:        MsgPreVoteReply,
		From:        n.cfg.ID,
		To:          m.From,
		Term:        m.Term,
		VoteGranted: grant,
	})
}

func (n *Node) handlePreVoteReply(m Message) {
	if n.role != PreCandidate || m.Term != n.currentTerm+1 {
		return
	}
	if m.VoteGranted {
		n.votes[m.From] = true
	}
	if len(n.votes) >= n.quorum() {
		n.startElection()
	}
}
`;

const realtimeGo = `package sim

import (
	"sync"
	"time"

	"example.org/tiny-raft/raft"
)

// Realtime runs each node in its own goroutine with a real ticker, and
// connects them with channels. It is closer to how a deployed Raft runs.
type Realtime struct {
	mu    sync.Mutex
	nodes []*raft.Node
	inbox []chan raft.Message
	stop  chan struct{}
}

func NewRealtime(c *Cluster, tick time.Duration) *Realtime {
	r := &Realtime{nodes: c.Nodes, stop: make(chan struct{})}
	for range c.Nodes {
		r.inbox = append(r.inbox, make(chan raft.Message, 64))
	}
	for i := range c.Nodes {
		go r.run(i, tick)
	}
	return r
}

func (r *Realtime) run(i int, tick time.Duration) {
	t := time.NewTicker(tick)
	defer t.Stop()
	for {
		select {
		case <-r.stop:
			return
		case <-t.C:
			r.mu.Lock()
			r.nodes[i].Tick()
			r.mu.Unlock()
		case m := <-r.inbox[i]:
			r.mu.Lock()
			r.nodes[i].Step(m)
			r.mu.Unlock()
		}
		r.mu.Lock()
		out := r.nodes[i].Outbox()
		r.mu.Unlock()
		for _, m := range out {
			select {
			case r.inbox[m.To] <- m:
			default: // full inbox: drop, like a congested network would
			}
		}
	}
}

func (r *Realtime) Stop() { close(r.stop) }
`;

export const tinyRaft: RepoSeed = {
  owner: { person: "priya" },
  name: "tiny-raft",
  description:
    "A teaching implementation of Raft in Go, with a deterministic network simulator. Used in the distributed systems course.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["priya"],
  threshold: 1,
  seeding: 22,
  files: {
    "README.md": readme,
    LICENSE: license,
    "go.mod": goMod,
    ".gitignore": gitignore,
    Makefile: makefile,
    "CHANGELOG.md": changelog,
    "raft/raft.go": raftGo,
    "raft/rpc.go": rpcGo,
    "raft/election.go": electionGo,
    "raft/log.go": logGo,
    "raft/election_test.go": electionTestGo,
    "sim/network.go": networkGo,
    "docs/notes/01-election.md": notesElection,
  },
  root: {
    label: "root",
    message: `Initial commit: leader election and a simulator

A single-threaded Raft node that only knows how to elect a leader, and a
simulator that runs a cluster of them with one seeded random source. The
node never sees a clock or a socket, so every test is reproducible.

This is week 1 of the course. Replication comes next.`,
    author: "priya",
    daysAgo: 356,
  },
  history: [
    {
      label: "shuffle",
      message: `sim: deliver messages in a random order

The simulator delivered messages in exactly the order they were sent,
which no real network promises. Shuffle each batch with the cluster's
seed so the tests see reordering, but still reproducibly.`,
      author: "priya",
      daysAgo: 349,
      changes: {
        "sim/network.go": [
          [
            "// messages that were in flight are delivered and the replies they\n",
            "// messages that were in flight are delivered in a random order and the\n// replies they",
          ],
          ["// produce are queued for the next step.\n", " produce are queued for the next step.\n"],
          [
            "\tbatch := c.inflight\n\tc.inflight = nil\n",
            `	batch := c.inflight
	c.inflight = nil
	// The network makes no ordering promises, and neither should the tests.
	c.Rand.Shuffle(len(batch), func(i, j int) { batch[i], batch[j] = batch[j], batch[i] })
`,
          ],
        ],
      },
    },
    {
      label: "repl",
      message: `Add log replication

AppendEntries, the consistency check, nextIndex and matchIndex, and the
commit rule. Followers truncate conflicting suffixes but never remove an
entry they already agree on, so a delayed duplicate request is harmless.

Backtracking is one entry at a time. The faster version from §5.3 is
left as an exercise.`,
      author: "priya",
      daysAgo: 341,
      changes: {
        "raft/replication.go": replicationGo,
        "raft/raft.go": [
          [
            "\tvotes map[int]bool\n",
            `	votes map[int]bool

	// Volatile state on leaders, reinitialised after every election.
	nextIndex  map[int]uint64
	matchIndex map[int]uint64
`,
          ],
          [
            "\t\t\tn.startElection()\n\t\t}\n",
            `			n.startElection()
		}
	case Leader:
		if n.elapsed >= n.cfg.HeartbeatTicks {
			n.broadcastAppend()
		}
`,
          ],
          [
            "\t\tn.handleRequestVoteReply(m)\n",
            `		n.handleRequestVoteReply(m)
	case MsgAppendEntries:
		n.handleAppendEntries(m)
	case MsgAppendEntriesReply:
		n.handleAppendEntriesReply(m)
`,
          ],
        ],
        "raft/election.go": [["\nfunc (n *Node) becomeLeader() {\n\tn.role = Leader\n}\n", ""]],
        "raft/rpc.go": [
          ["\tMsgRequestVoteReply\n)", "\tMsgRequestVoteReply\n\tMsgAppendEntries\n\tMsgAppendEntriesReply\n)"],
          [
            "\tVoteGranted bool\n}",
            `	VoteGranted bool

	// AppendEntries
	PrevLogIndex uint64
	PrevLogTerm  uint64
	Entries      []Entry
	LeaderCommit uint64

	// AppendEntries reply. MatchIndex is not in the paper: it tells the
	// leader how far the follower now matches, so the leader does not
	// have to remember what it sent in each request.
	Success    bool
	MatchIndex uint64
}`,
          ],
        ],
      },
    },
    {
      label: "repl-tests",
      message: `Add replication tests

One happy-path test, and one that commits through a network dropping
30% of messages across a hundred seeds.`,
      author: "priya",
      daysAgo: 334,
      changes: {
        "raft/replication_test.go": replicationTestGo,
      },
    },
    {
      label: "notes-week2",
      message: `docs: lecture notes for week 2`,
      author: "priya",
      daysAgo: 321,
      changes: {
        "docs/notes/02-replication.md": notesReplication,
        "README.md": [
          ["3. `sim/network.go`, then the tests\n", "3. `sim/network.go`, then the tests\n\nLecture notes are in `docs/notes/`.\n"],
        ],
      },
    },
    {
      label: "notes-fix",
      message: `docs: fix nextIndex/matchIndex description

Reported by a student: the notes said matchIndex starts at the end of
the leader's log. It starts at 0.`,
      author: "priya",
      daysAgo: 318,
      changes: {
        "docs/notes/02-replication.md": [
          [
            "follower. It starts at the end of the leader's log and only moves forward.\n",
            "follower. It starts at 0 and only moves forward.\n",
          ],
          [
            "They look similar, but `nextIndex` is a guess and `matchIndex` is a fact.\n",
            "They look similar, but `nextIndex` is a guess and `matchIndex` is a fact.\nIf you remember one thing from this section, make it that sentence.\n",
          ],
        ],
      },
    },
    {
      label: "partition",
      message: `sim: add Isolate and Heal

Isolate cuts nodes off from the network entirely; they keep ticking, so
an isolated leader carries on believing it leads. Heal reconnects
everyone. Enough to build the Figure 8 scenario and most partition
tests without a general-purpose partition API.`,
      author: "tomas",
      daysAgo: 306,
      changes: {
        "sim/network.go": [
          [
            "\tinflight []raft.Message\n",
            "\t// cut[i] means node i can neither send nor receive.\n\tcut map[int]bool\n\n\tinflight []raft.Message\n",
          ],
          [
            "c := &Cluster{Rand: rand.New(rand.NewSource(seed))}",
            "c := &Cluster{Rand: rand.New(rand.NewSource(seed)), cut: map[int]bool{}}",
          ],
          [
            "\t\tif c.Rand.Float64() < c.DropRate {\n",
            "\t\tif c.cut[m.From] || c.cut[m.To] || c.Rand.Float64() < c.DropRate {\n",
          ],
          [
            "\treturn leader\n}\n",
            `	return leader
}

// Isolate cuts the given nodes off from the network. They keep ticking,
// so an isolated leader carries on believing it leads.
func (c *Cluster) Isolate(ids ...int) {
	for _, id := range ids {
		c.cut[id] = true
	}
}

// Heal reconnects every node. Messages dropped while a node was isolated
// stay dropped.
func (c *Cluster) Heal() {
	c.cut = map[int]bool{}
}
`,
          ],
        ],
      },
    },
    {
      label: "figure8",
      message: `Only commit entries from the current term by counting

advanceCommit committed any index stored on a majority, including
entries from earlier terms. That is exactly the bug Figure 8 of the
paper warns about: such an entry can still be overwritten by a later
leader. Now only entries from the leader's own term are committed by
counting; older ones follow along once something from this term on top
of them commits.`,
      author: "priya",
      daysAgo: 299,
      changes: {
        "raft/replication.go": [
          [
            "\t\tif count >= n.quorum() {\n",
            `		// §5.4.2: only an entry from the current term is committed by
		// counting replicas. Entries from earlier terms are committed
		// indirectly, when one from this term on top of them is.
		if t, _ := n.log.Term(idx); count >= n.quorum() && t == n.currentTerm {
`,
          ],
        ],
      },
    },
    {
      label: "figure8-test",
      message: `Add a Figure 8 regression test

Leaders are isolated at random while entries are half replicated, and
every node's applied entries must agree index by index. Fails on the
commit before this one within the first dozen seeds.`,
      author: "priya",
      daysAgo: 298,
      changes: {
        "raft/replication_test.go": [
          ['\t"testing"\n\n\t"example.org/tiny-raft/sim"\n', '\t"testing"\n\n\t"example.org/tiny-raft/raft"\n\t"example.org/tiny-raft/sim"\n'],
          ["\t\t\tt.Fatalf(\"seed %d: entry %d applied on %d nodes, want a majority\", seed, index, committed)\n\t\t}\n\t}\n}\n", "\t\t\tt.Fatalf(\"seed %d: entry %d applied on %d nodes, want a majority\", seed, index, committed)\n\t\t}\n\t}\n}\n" + figure8Test],
        ],
      },
    },
    {
      label: "timeouts",
      message: `Seed election timeouts from the simulator

resetTimer used the global math/rand source, so two runs of the same
test with the same cluster seed could still elect different leaders.
Each node now gets its own *rand.Rand, derived from the cluster seed
and its ID, and the global source is never touched.`,
      author: "yuki",
      daysAgo: 271,
      changes: {
        "raft/raft.go": [
          [
            "\tHeartbeatTicks int\n}",
            `	HeartbeatTicks int

	// Rand drives the randomised timeouts. The simulator passes one
	// seeded from the cluster seed, so a run can be replayed exactly.
	Rand *rand.Rand
}`,
          ],
          ["rand.Intn(n.cfg.ElectionTicks)", "n.cfg.Rand.Intn(n.cfg.ElectionTicks)"],
        ],
        "sim/network.go": [
          [
            "\t\t\tHeartbeatTicks: 3,\n",
            "\t\t\tHeartbeatTicks: 3,\n\t\t\tRand:           rand.New(rand.NewSource(seed*1000 + int64(id))),\n",
          ],
        ],
      },
    },
    {
      label: "v0.1.0",
      message: `Release 0.1.0

Election, replication, the Figure 8 fix and a reproducible simulator.
This is what the spring course will use.`,
      author: "priya",
      daysAgo: 251,
      changes: {
        "CHANGELOG.md": changelog010,
      },
    },
    {
      label: "storage",
      message: `Add a Storage interface for persistent state

currentTerm, votedFor and the log are saved before any message leaves
the node, as Figure 2 requires. MemoryStorage outlives its Node, which
is all the simulator needs to model a crash and restart.

Persisting the whole log on every send is wildly inefficient and
completely correct; students can optimise it once they understand why
it has to happen at all.`,
      author: "priya",
      daysAgo: 231,
      changes: {
        "raft/storage.go": storageGo,
        "raft/raft.go": [
          [
            "\tRand *rand.Rand\n}",
            "\tRand *rand.Rand\n\n\t// Storage is optional; without it nothing survives a restart.\n\tStorage Storage\n}",
          ],
          ["\tm.Term = n.currentTerm\n", "\tm.Term = n.currentTerm\n\t// Figure 2: persist before responding to RPCs.\n\tn.persist()\n"],
          [
            "\tn := &Node{cfg: cfg, votedFor: -1, log: NewLog()}\n",
            "\tn := &Node{cfg: cfg, votedFor: -1, log: NewLog()}\n\tn.restore()\n",
          ],
        ],
        "sim/network.go": [["\t\t\tHeartbeatTicks: 3,\n", "\t\t\tHeartbeatTicks: 3,\n\t\t\tStorage:        &raft.MemoryStorage{},\n"]],
      },
    },
    {
      label: "typos",
      message: `docs: fix typos in the week 1 notes`,
      author: "theo",
      daysAgo: 216,
      changes: {
        "docs/notes/01-election.md": [
          ["for election. The timeout is random, so that usualy one node times out\n", "for election. The timeout is random, so that usually one node times out\n"],
          ["Next week we will add the second voting rule", "Next week we'll add the second voting rule"],
        ],
      },
    },
    {
      label: "snapshots",
      message: `Add snapshots and InstallSnapshot

The log now has an offset: entries[0] stands for the last entry covered
by the snapshot, and every lookup subtracts its index. A leader whose
follower needs compacted entries sends the whole snapshot instead of
AppendEntries; the follower hands it to the application through
PendingSnapshot.

Snapshots go in one message. The paper chunks them, which matters for
real networks and not at all for the simulator.`,
      author: "priya",
      daysAgo: 201,
      changes: {
        "raft/snapshot.go": snapshotGo,
        "raft/log.go": logGoSnap,
        "raft/raft.go": [
          [
            "\toutbox []Message\n",
            `	// The latest snapshot, and one received from the leader that the
	// application has not restored yet.
	snapshot        Snapshot
	pendingSnapshot *Snapshot

	outbox []Message
`,
          ],
          ["\t\tn.handleAppendEntriesReply(m)\n", "\t\tn.handleAppendEntriesReply(m)\n\tcase MsgInstallSnapshot:\n\t\tn.handleInstallSnapshot(m)\n"],
        ],
        "raft/rpc.go": [
          ["\tMsgAppendEntriesReply\n)", "\tMsgAppendEntriesReply\n\tMsgInstallSnapshot\n)"],
          [
            "\tMatchIndex uint64\n}",
            `	MatchIndex uint64

	// InstallSnapshot. The paper sends snapshots in chunks; we send the
	// whole thing at once because the simulator doesn't care.
	Snapshot Snapshot
}`,
          ],
        ],
        "raft/replication.go": [
          [
            "func (n *Node) sendAppend(peer int) {\n",
            `func (n *Node) sendAppend(peer int) {
	if n.nextIndex[peer] <= n.snapshot.LastIndex {
		// The entries this peer needs have been compacted away.
		n.sendSnapshot(peer)
		return
	}
`,
          ],
        ],
      },
    },
    {
      label: "snapshot-tests",
      message: `Add a snapshot catch-up test`,
      author: "priya",
      daysAgo: 194,
      changes: {
        "raft/snapshot_test.go": snapshotTestGo,
      },
    },
    {
      label: "compact-fix",
      message: `log: keep entries after the snapshot point when compacting

Compact replaced the whole log with the new sentinel, so a leader that
called TakeSnapshot lost every entry it had appended after the snapshot
index, including uncommitted ones it was still replicating.

§7: if the log already contains the entry the snapshot ends with, keep
everything after it. Only a missing or conflicting entry means the rest
of the log is useless.`,
      author: "tomas",
      daysAgo: 185,
      changes: {
        "raft/log.go": [
          [
            "\tl.entries = []Entry{{Term: term, Index: index}}\n}",
            `	if t, ok := l.Term(index); ok && t == term {
		rest := l.entries[index-l.first()+1:]
		l.entries = append([]Entry{{Term: term, Index: index}}, rest...)
		return
	}
	l.entries = []Entry{{Term: term, Index: index}}
}`,
          ],
        ],
        "raft/log_test.go": logTestGo,
      },
    },
    {
      label: "trace",
      message: `sim: record a trace of delivered messages

Set Cluster.Trace and every delivered message is recorded with its
tick. WriteTo prints one line per message, which has been far easier to
read next to the paper than adding printlns to the node.`,
      author: "ada",
      daysAgo: 181,
      changes: {
        "sim/trace.go": traceGo,
        "sim/network.go": [
          [
            "\t// cut[i] means node i can neither send nor receive.\n",
            "\t// Trace, if set, records every delivered message.\n\tTrace *Trace\n\n\t// cut[i] means node i can neither send nor receive.\n",
          ],
          ["\t\tc.Nodes[m.To].Step(m)\n", "\t\tc.Trace.record(c.now, m)\n\t\tc.Nodes[m.To].Step(m)\n"],
        ],
      },
    },
    {
      label: "notes-week3",
      message: `docs: lecture notes for week 3 (snapshots)`,
      author: "priya",
      daysAgo: 166,
      changes: {
        "docs/notes/03-snapshots.md": notesSnapshots,
      },
    },
    {
      label: "race",
      message: `Makefile: add a race target

go test -race over everything, with -count=1 so cached results don't
hide a race that only shows up on some runs.`,
      author: "self",
      daysAgo: 140,
      changes: {
        Makefile: [
          [".PHONY: test vet cover\n", ".PHONY: test race vet cover\n"],
          ["vet:\n", "race:\n\tgo test -race -count=1 ./...\n\nvet:\n"],
        ],
      },
    },
    {
      label: "kvdemo",
      message: `Add kvdemo, the key-value store from lecture 4

Five nodes in the simulator, three writes, an isolated leader, a new
leader, one more write, then every node's view of the store. It is
meant to be read top to bottom in one go.`,
      author: "priya",
      daysAgo: 121,
      changes: {
        "cmd/kvdemo/main.go": kvdemoGo,
      },
    },
    {
      label: "stale-reply",
      message: `Ignore AppendEntries replies from earlier terms

A failure reply to a request from an earlier term could arrive after the
node had been re-elected, and the leader would decrement nextIndex for a
follower that was in fact up to date, then resend entries it already
had. Harmless for safety, but it showed up as odd traces and made one
of the snapshot tests flaky.`,
      author: "yuki",
      daysAgo: 96,
      changes: {
        "raft/replication.go": [
          [
            "func (n *Node) handleAppendEntriesReply(m Message) {\n\tif n.role != Leader {\n",
            `func (n *Node) handleAppendEntriesReply(m Message) {
	// Replies can arrive long after the request, by which time we may
	// have lost and regained leadership. Only trust replies to requests
	// we sent in the term we are leading now.
	if n.role != Leader || m.Term != n.currentTerm {
`,
          ],
        ],
      },
    },
    {
      label: "vote-timer",
      message: `Reset the election timer only when granting a vote

Followers reset their timer whenever they adopted a newer term,
including from a RequestVote they then rejected. A candidate with a
stale log could keep the rest of the cluster from timing out and so
from ever electing a node that could win. Figure 2 is explicit: reset
on AppendEntries from the current leader, or when granting a vote.`,
      author: "priya",
      daysAgo: 81,
      changes: {
        "raft/raft.go": [["\tn.votedFor = -1\n\tn.resetTimer()\n}", "\tn.votedFor = -1\n}"]],
        "raft/election.go": [
          [
            "\tif grant {\n\t\tn.votedFor = m.From\n\t}",
            `	if grant {
		// Only granting a vote resets the timer (Figure 2, rules for
		// followers). Resetting on every RequestVote lets a candidate
		// that can never win keep everyone else from trying.
		n.votedFor = m.From
		n.resetTimer()
	}`,
          ],
        ],
      },
    },
    {
      label: "v0.2.0",
      message: `Release 0.2.0

Snapshots, storage, traces and kvdemo, plus three correctness fixes.
This is the autumn course version.`,
      author: "priya",
      daysAgo: 61,
      changes: {
        "CHANGELOG.md": changelog020,
        "README.md": [
          [
            "3. `sim/network.go`, then the tests\n",
            "3. `raft/snapshot.go` and `raft/storage.go` (week 3)\n4. `sim/network.go`, then the tests\n5. `cmd/kvdemo/main.go`, to see it all working\n",
          ],
        ],
      },
    },
    {
      label: "dup",
      message: `sim: duplicate messages

Real networks retransmit, so the same request can arrive twice, and
sometimes much later. DupRate redelivers a message in the next step
with the given probability. All existing tests pass with it at 0.1,
which is the point of the "skip entries we already have" rule in
Log.Append.`,
      author: "tomas",
      daysAgo: 46,
      changes: {
        "sim/network.go": [
          [
            "\tDropRate float64\n",
            "\tDropRate float64\n\t// DupRate is the probability that a message is delivered again on\n\t// the next step.\n\tDupRate float64\n",
          ],
          [
            "\t\tc.Nodes[m.To].Step(m)\n",
            "\t\tc.Nodes[m.To].Step(m)\n\t\tif c.Rand.Float64() < c.DupRate {\n\t\t\tc.inflight = append(c.inflight, m)\n\t\t}\n",
          ],
        ],
      },
    },
    {
      label: "exercises",
      message: `docs: add the exercise list

All exercises for weeks 1 to 3 in one place, with a request not to post
solutions as patches.`,
      author: "priya",
      daysAgo: 31,
      changes: {
        "docs/exercises.md": exercises,
      },
    },
    {
      label: "readme-short",
      message: `README: mention -short for the slow tests

TestElectionSafety and TestFigure8 run hundreds of seeds and take a
while on older laptops. Under -short they run twenty.`,
      author: "priya",
      daysAgo: 12,
      changes: {
        "README.md": [
          [
            "message; rerun just that seed and read the trace.\n",
            "message; rerun just that seed and read the trace.\n\nThe seed-sweeping tests are slow on older machines. `go test -short ./...`\nruns twenty seeds each instead of hundreds.\n",
          ],
        ],
        "raft/election_test.go": [
          [
            "\tfor seed := int64(0); seed < 200; seed++ {\n",
            "\tseeds := int64(200)\n\tif testing.Short() {\n\t\tseeds = 20\n\t}\n\tfor seed := int64(0); seed < seeds; seed++ {\n",
          ],
        ],
        "raft/replication_test.go": [
          [
            "func TestFigure8(t *testing.T) {\n\tfor seed := int64(0); seed < 100; seed++ {\n",
            "func TestFigure8(t *testing.T) {\n\tseeds := int64(100)\n\tif testing.Short() {\n\t\tseeds = 20\n\t}\n\tfor seed := int64(0); seed < seeds; seed++ {\n",
          ],
        ],
      },
    },
    {
      label: "votedfor-comment",
      message: `Explain why votedFor is persistent

Came up in office hours twice this week.`,
      author: "priya",
      daysAgo: 4,
      changes: {
        "raft/raft.go": [
          [
            "\tvotedFor    int // -1 if none this term\n",
            `	// votedFor has to survive a restart: a node that forgot it had
	// voted could vote again in the same term and let two candidates
	// both win it.
	votedFor    int // -1 if none this term
`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Week 2 notes: matchIndex does not start at the end of the log",
      author: "zeynep",
      daysAgo: 319,
      body: "The notes say matchIndex \"starts just past the end of the leader's log\", but `becomeLeader` sets it to 0 for every peer. I think the sentence was meant for nextIndex? Took me a while to figure out which one was wrong.",
      labels: ["docs"],
      state: "solved",
      closedHoursAfter: 22,
      comments: [
        {
          author: "priya",
          body: "You're right, and I can see how that cost you an evening. The code is correct, the notes had the two swapped in one place. Fixed, and I added a line underlining the difference because everyone mixes them up.",
          hoursAfter: 21,
          reactions: [{ emoji: "🙏", by: ["zeynep"] }],
        },
      ],
    },
    {
      title: "Election tests give different results every run",
      author: "theo",
      daysAgo: 284,
      body: `\`TestElectsOneLeader\` passes most of the time but every so often reports 0 leaders. Same seed (1) each time. I thought the whole point of the simulator was that this can't happen?

\`\`\`
--- FAIL: TestElectsOneLeader (0.00s)
    election_test.go:20: got 0 leaders after 50 ticks, want 1
\`\`\``,
      labels: ["bug", "sim"],
      state: "solved",
      closedHoursAfter: 300,
      comments: [
        {
          author: "yuki",
          body: "`resetTimer` uses the package-level `rand.Intn`, not the cluster's `Rand`. So the network is deterministic but the timeouts aren't. Since Go 1.20 the global source is randomly seeded on startup, which is why it changed between runs.",
          hoursAfter: 5,
          reactions: [{ emoji: "🎯", by: ["theo", "priya"] }],
        },
        {
          author: "priya",
          body: "Oh, that's embarrassing. Yuki, want to send a fix? I'd pass a `*rand.Rand` in `Config` and have the simulator derive one per node from the cluster seed.",
          hoursAfter: 9,
          replyTo: 0,
        },
        {
          author: "yuki",
          body: "On it.",
          hoursAfter: 10,
          replyTo: 1,
        },
        {
          author: "theo",
          body: "Confirmed fixed, ran it 500 times in a loop. Thanks both.",
          hoursAfter: 310,
        },
      ],
    },
    {
      title: "Why can't a leader commit an old entry once it's on a majority?",
      author: "hana",
      daysAgo: 263,
      body: `I'm stuck on §5.4.2 and Figure 8. If an entry is stored on a majority of servers, then any future leader has to have it (because of the election restriction), right? So why isn't it safe to commit it?

The code has \`t == n.currentTerm\` in \`advanceCommit\` and I understand *what* it does, just not why it's needed.`,
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 96,
      comments: [
        {
          author: "priya",
          body: `Good question, and it's the one that trips up almost everyone. The catch is in "any future leader has to have it". The election restriction compares the *last* entries of logs, not whether a particular entry is present.

Walk through Figure 8 slowly: in (c), the entry from term 2 is on S1, S2 and S3, a majority. But in (d), S5 can still win an election with votes from S2, S3 and S4, because S5's last entry is from term 3, which beats their last entry from term 2. Then S5 overwrites the term 2 entry everywhere.

So "stored on a majority" isn't enough on its own. "Stored on a majority, *and* there's an entry from the current term on top of it on that majority" is.`,
          hoursAfter: 4,
          reactions: [{ emoji: "❤️", by: ["hana", "wren"] }],
        },
        {
          author: "hana",
          body: "So the term 2 entry being on S3 doesn't help, because S3's log is \"less up to date\" than S5's even though S3 has more of the history that matters?",
          hoursAfter: 7,
          replyTo: 0,
        },
        {
          author: "priya",
          body: "Exactly. Up-to-dateness is only about the last entry. Once the leader commits something from term 4, every majority that could elect a new leader includes someone whose last entry is from term 4, and only nodes with that entry (and so everything before it) can win.",
          hoursAfter: 9,
          replyTo: 1,
        },
        {
          author: "tomas",
          body: "One thing that helped me: comment out the `t == n.currentTerm` check and run `TestFigure8`. It fails within a few seeds, and the trace shows exactly this sequence.",
          hoursAfter: 26,
          reactions: [{ emoji: "👍", by: ["hana", "priya"] }],
        },
        {
          author: "hana",
          body: "Did that, seed 4 fails and I can follow it in the trace. I think I actually get it now. Closing, thank you!",
          hoursAfter: 95,
          replyTo: 3,
        },
      ],
    },
    {
      title: "Two-node cluster never recovers when one node is down",
      author: "wren",
      daysAgo: 241,
      body: "I changed kvdemo-style code to use 2 nodes and isolated one of them. The other one keeps starting elections forever and never becomes leader. Is this a bug in the election code? With 3 nodes and one down it works fine.",
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 30,
      comments: [
        {
          author: "priya",
          body: "Not a bug, it's the arithmetic. A majority of 2 is 2, so the remaining node can never win an election alone. Two nodes tolerate zero failures, same as one node, which is why you'll almost always see odd cluster sizes. 3 tolerates 1, 5 tolerates 2.",
          hoursAfter: 3,
        },
        {
          author: "wren",
          body: "Ahh. So adding a second node to a single server makes it *less* available, not more. That's a bit counterintuitive but makes sense.",
          hoursAfter: 6,
          replyTo: 0,
          reactions: [{ emoji: "💯", by: ["priya"] }],
        },
        {
          author: "ada",
          body: "Worth putting in the week 1 notes maybe? It's a classic exam question.",
          hoursAfter: 28,
        },
      ],
    },
    {
      title: "TakeSnapshot on the leader throws away entries after the snapshot index",
      author: "tomas",
      daysAgo: 188,
      body: `Repro: leader has entries 1..20, 1..15 committed and applied. Call \`TakeSnapshot(15, ...)\`. Afterwards \`LastIndex()\` is 15 and entries 16..20 are gone, so they never get replicated.

\`Log.Compact\` replaces the whole slice with the new sentinel. I think it should only do that when the log doesn't already contain a matching entry at the snapshot index (§7, "If existing log entry has same index and term as snapshot's last included entry, retain log entries following it").`,
      labels: ["bug"],
      assignees: ["tomas"],
      state: "solved",
      closedHoursAfter: 74,
      comments: [
        {
          author: "priya",
          body: "Yes, that's wrong, and the snapshot test didn't catch it because it snapshots exactly at the last index. Want to take it? A unit test on `Log` directly would be good, the cluster tests are too coarse for this.",
          hoursAfter: 2,
        },
        {
          author: "tomas",
          body: "Sure, I'll add `raft/log_test.go`.",
          hoursAfter: 4,
          replyTo: 0,
        },
        {
          author: "priya",
          body: "Merged. Thanks for the careful repro.",
          hoursAfter: 74,
        },
      ],
    },
    {
      title: "Why is everything single-threaded?",
      author: "malik",
      daysAgo: 157,
      body: "Coming from other Go code, it's unusual to see no goroutines or channels at all. Real Raft implementations run timers and RPCs concurrently. Doesn't this hide a whole class of bugs?",
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 140,
      comments: [
        {
          author: "priya",
          body: `It hides concurrency bugs *in the implementation*, on purpose. What it doesn't hide is the interesting part: messages lost, reordered, duplicated, nodes isolated. The simulator does all of that, and does it the same way every time.

When students used a goroutine-per-node version a few years ago, most of the course turned into debugging data races and flaky tests instead of learning why Raft is correct. A test that fails one run in two hundred and can't be replayed is useless for learning.`,
          hoursAfter: 6,
          reactions: [{ emoji: "👍", by: ["ada", "yuki"] }],
        },
        {
          author: "malik",
          body: "That's fair. I'll open a patch with a goroutine runner anyway as an optional mode, maybe it's useful for a later lecture.",
          hoursAfter: 11,
          replyTo: 0,
        },
        {
          author: "ada",
          body: "For what it's worth, the step-function design is how several production libraries structure their core too. Concurrency lives in a thin layer around it.",
          hoursAfter: 30,
        },
      ],
    },
    {
      title: "kvdemo reads from the local map, so it can return stale values",
      author: "self",
      daysAgo: 102,
      body: `In kvdemo the final printout reads each node's \`stores[i]\` directly. That's fine for a demo, but if someone copies the pattern to serve client reads from "the leader", an isolated old leader will happily serve stale data.

Should the demo show a linearizable read, or at least have a comment warning about it?`,
      labels: ["kvdemo", "enhancement"],
      assignees: ["yuki"],
      comments: [
        {
          author: "priya",
          body: "Good point. The demo is deliberately naive, but I agree it shouldn't look like a pattern to copy. A short comment now, and a proper ReadIndex implementation later would make a nice lecture.",
          hoursAfter: 14,
        },
        {
          author: "yuki",
          body: "I've wanted to write ReadIndex for a while. I'll take it.",
          hoursAfter: 20,
          reactions: [{ emoji: "🎉", by: ["self", "priya"] }],
        },
        {
          author: "self",
          body: "Happy to review when it's up.",
          hoursAfter: 22,
          replyTo: 1,
        },
      ],
    },
    {
      title: "Should a follower reset its election timer when it sees a RequestVote?",
      author: "ines",
      daysAgo: 86,
      body: `In \`Step\`, a RequestVote with a higher term calls \`becomeFollower\`, which resets the timer, even if we then reject the vote because the candidate's log is behind ours.

Figure 2 says followers reset on AppendEntries from the current leader or on *granting* a vote. Is the difference intentional?`,
      labels: ["question", "bug"],
      state: "solved",
      closedHoursAfter: 130,
      comments: [
        {
          author: "theo",
          body: "I think this can livelock: a node with a stale log keeps timing out and asking for votes, every time it resets everyone's timer, and the nodes that *could* win never time out.",
          hoursAfter: 8,
        },
        {
          author: "priya",
          body: "Not intentional, and theo's scenario is exactly the problem. Well spotted, ines, this has been there since the first commit. I'll fix it and mention it in the next lecture, it's a nice example of how much a single line of Figure 2 matters.",
          hoursAfter: 26,
          reactions: [{ emoji: "😮", by: ["ines"] }, { emoji: "👍", by: ["theo"] }],
        },
        {
          author: "ines",
          body: "Wow, I really just wanted to check I'd understood the paper.",
          hoursAfter: 31,
          replyTo: 1,
          reactions: [{ emoji: "😄", by: ["priya", "theo"] }],
        },
      ],
    },
    {
      title: "Pre-vote and CheckQuorum",
      author: "theo",
      daysAgo: 52,
      body: `When a node is isolated for a while it keeps bumping its term. Once it reconnects, its RequestVotes force the current leader to step down, even though the isolated node can't win (its log is behind). Easy to see with \`kvdemo\` plus a trace.

The thesis describes pre-vote for this, and CheckQuorum for the opposite case (a leader that can't reach a majority stepping down on its own). I'd like to add both, behind a config flag so week 1 stays simple.`,
      labels: ["enhancement"],
      assignees: ["theo"],
      comments: [
        {
          author: "priya",
          body: "Yes please, behind a flag. Note that exercise 1.1 is a simplified pre-vote, so I'd rather not merge before the week 1 deadline. A draft patch is fine to start with.",
          hoursAfter: 10,
        },
        {
          author: "theo",
          body: "Makes sense. I'll keep it as a draft until the deadline has passed.",
          hoursAfter: 13,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Spanish translation of the lecture notes?",
      author: "diego",
      daysAgo: 36,
      body: "Several people in our study group would find it easier to follow the notes in Spanish. I could translate weeks 1 to 3 if you'd accept them, maybe under `docs/notes/es/`?",
      labels: ["docs"],
      comments: [
        {
          author: "priya",
          body: "That would be lovely, thank you! `docs/notes/es/` is perfect. Keep the section numbers and code identifiers untranslated so they match the paper and the code.",
          hoursAfter: 5,
          reactions: [{ emoji: "❤️", by: ["diego", "ines"] }],
        },
        {
          author: "ines",
          body: "Happy to proofread.",
          hoursAfter: 19,
        },
      ],
    },
    {
      title: "TestElectionSafety takes 40 seconds on my laptop",
      author: "noor",
      daysAgo: 15,
      body: "It runs 200 seeds × 300 steps × 5 nodes. On a 2017 laptop that's most of my test run. Could there be a fast mode for iterating?",
      labels: ["tests"],
      state: "solved",
      closedHoursAfter: 72,
      comments: [
        {
          author: "ada",
          body: "`-short` is the conventional way. Twenty seeds catch nearly everything; the full sweep is for CI.",
          hoursAfter: 3,
        },
        {
          author: "priya",
          body: "Done, `go test -short ./...` runs twenty seeds. And I've documented it in the README.",
          hoursAfter: 72,
          reactions: [{ emoji: "🚀", by: ["noor"] }],
        },
      ],
    },
    {
      title: "Exercise 2.3: is the expected solution the one from the extended paper?",
      author: "amara",
      daysAgo: 6,
      body: "The end of §5.3 only sketches the faster backtracking. There seem to be a couple of variants around (conflict term + first index of that term, or just the follower's last index). Is either acceptable for the exercise, or do the tests expect one specifically?",
      labels: ["question", "exercise"],
      comments: [
        {
          author: "priya",
          body: "Either is fine. The tests only check that a follower 50 entries behind catches up in a handful of round trips, not exactly how. If you want the full version, implement the conflict-term one, it's the more interesting of the two.",
          hoursAfter: 8,
          reactions: [{ emoji: "👍", by: ["amara"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "sim: partition the network",
      author: "tomas",
      daysAgo: 309,
      labels: ["sim"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds `Cluster.Partition(groups ...[]int)` so tests can split the cluster into arbitrary groups, and `Heal()` to undo it. Messages between nodes in different groups are dropped. Nodes not listed end up alone.",
          hoursAfter: 0,
          base: "notes-week2",
          commits: [
            {
              message: `sim: add Partition and Heal

Partition takes any number of groups; messages only flow within a
group. A nil map means everyone is in group 0, so a fresh cluster is
fully connected without any setup.`,
              author: "tomas",
              daysAgo: 309,
              changes: {
                "sim/network.go": [
                  [
                    "\tinflight []raft.Message\n",
                    "\t// group[i] is the partition node i is in. Nodes only hear from\n\t// nodes in the same group. A nil map means everyone is in group 0.\n\tgroup map[int]int\n\n\tinflight []raft.Message\n",
                  ],
                  [
                    "\t\tif c.Rand.Float64() < c.DropRate {\n",
                    "\t\tif c.group[m.From] != c.group[m.To] || c.Rand.Float64() < c.DropRate {\n",
                  ],
                  [
                    "\treturn leader\n}\n",
                    `	return leader
}

// Partition splits the cluster into the given groups. Nodes that are not
// listed in any group end up alone.
func (c *Cluster) Partition(groups ...[]int) {
	c.group = map[int]int{}
	for id := range c.Nodes {
		c.group[id] = -1 - id
	}
	for g, ids := range groups {
		for _, id := range ids {
			c.group[id] = g
		}
	}
}

// Heal puts every node back in the same group.
func (c *Cluster) Heal() {
	c.group = nil
}
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "priya",
              hoursAfter: 20,
              summary:
                "Thanks, this is neat, and I like that the nil map means fully connected. One question about the API before we commit to it.",
              comments: [
                {
                  body: "Every test I have in mind (Figure 8, the kvdemo, the snapshot catch-up) just wants to cut one node off. Could we start with `Isolate(ids ...int)` and grow to arbitrary groups only when a test needs it? Students read this file, so fewer concepts is better.",
                  path: "sim/network.go",
                  line: 90,
                },
                {
                  body: "`-1 - id` is clever but it took me a minute. If we keep this, a comment saying \"a unique negative group per node\" would help.",
                  path: "sim/network.go",
                  line: 93,
                },
              ],
            },
          ],
          comments: [
            {
              author: "tomas",
              body: "Fair, I was thinking ahead to asymmetric partitions but nothing needs them yet. I'll rework it as Isolate/Heal.",
              hoursAfter: 26,
            },
          ],
        },
        {
          description:
            "Reworked as `Isolate(ids ...int)` and `Heal()`. An isolated node keeps ticking, so an isolated leader still believes it leads, which is what the Figure 8 test needs.",
          hoursAfter: 70,
          fromHistory: ["partition"],
          reviews: [
            {
              author: "priya",
              hoursAfter: 74,
              verdict: "accept",
              summary: "Much simpler to explain in a lecture. Merging, thank you!",
              comments: [
                {
                  body: "Worth a sentence in the docs that dropped messages stay dropped after Heal, nice that you wrote it here.",
                  path: "sim/network.go",
                  line: 95,
                  endLine: 96,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "sim: record a trace of delivered messages",
      author: "ada",
      daysAgo: 183,
      labels: ["sim", "debugging"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds `sim.Trace`. Set `c.Trace = &sim.Trace{}` before running, and on failure `c.Trace.WriteTo(os.Stderr)` prints one line per delivered message with its tick, sender, receiver, term and a short summary. A nil trace records nothing, so there's no cost when it's unused.",
          hoursAfter: 0,
          fromHistory: ["trace"],
          reviews: [
            {
              author: "priya",
              hoursAfter: 18,
              verdict: "accept",
              summary:
                "This is going straight into the week 2 debugging lecture. Small suggestion inline, otherwise good to go.",
              comments: [
                {
                  body: "Thanks for printing the kind number here instead of \"?\". I will forget to update this switch when we add pre-vote, and this way the trace stays readable.",
                  path: "sim/trace.go",
                  line: 57,
                  resolved: true,
                },
                {
                  body: "Nil receiver check is a nice touch. Maybe mention it on the Trace field in network.go too.",
                  path: "sim/trace.go",
                  line: 23,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "theo",
              body: "Used this last night on a failing seed and found my bug in five minutes. Please merge 🙏",
              hoursAfter: 22,
              reactions: [{ emoji: "😄", by: ["ada", "priya"] }],
            },
          ],
        },
      ],
    },
    {
      title: "sim: optional real-time runner with goroutines",
      author: "malik",
      daysAgo: 152,
      labels: ["sim"],
      state: "archived",
      revisions: [
        {
          description:
            "Adds `sim.Realtime`, which runs each node in its own goroutine with a `time.Ticker` and connects them with buffered channels. The deterministic simulator is untouched; this is an optional mode for seeing the nodes run on real time.",
          hoursAfter: 0,
          base: "notes-week3",
          commits: [
            {
              message: `sim: add a goroutine-per-node runner

Each node ticks on a real time.Ticker and receives messages from its
own channel. A full inbox drops the message.`,
              author: "malik",
              daysAgo: 152,
              changes: {
                "sim/realtime.go": realtimeGo,
              },
            },
          ],
          reviews: [
            {
              author: "priya",
              hoursAfter: 30,
              summary:
                "Thanks for writing this up, and it's tidy. I'm going to say no for this repo though, see my comment below.",
              comments: [
                {
                  body: "One mutex around every node means the nodes never actually run concurrently, so this mostly adds nondeterminism without the parallelism. Not a blocker for an optional mode, just worth knowing.",
                  path: "sim/realtime.go",
                  line: 13,
                },
              ],
            },
          ],
          comments: [
            {
              author: "priya",
              body: "I've thought about this a lot since the issue. Having a nondeterministic mode in the repo invites students to use it for debugging, and we're back to flaky tests nobody can replay. I'd rather keep this out of tiny-raft and link it from the notes as further reading. Would you be OK publishing it as a separate repo?",
              hoursAfter: 32,
            },
            {
              author: "malik",
              body: "Totally fine, I'll put it in my own repo and send you the link.",
              hoursAfter: 40,
              replyTo: 0,
              reactions: [{ emoji: "❤️", by: ["priya"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Makefile: add a race target",
      author: "self",
      daysAgo: 141,
      labels: ["tooling"],
      state: "merged",
      revisions: [
        {
          description:
            "`make race` runs `go test -race -count=1 ./...`. Nothing is concurrent today, but kvdemo will grow and students do add goroutines in their solutions.",
          hoursAfter: 0,
          fromHistory: ["race"],
          reviews: [
            {
              author: "priya",
              hoursAfter: 9,
              verdict: "accept",
              summary: "Small and useful, thanks. I'll mention it in the exercise instructions.",
            },
          ],
        },
      ],
    },
    {
      title: "Linearizable reads with ReadIndex",
      author: "yuki",
      daysAgo: 28,
      labels: ["enhancement", "kvdemo"],
      state: "open",
      revisions: [
        {
          description: `Implements the read-only query protocol from §8: the leader records its commitIndex as the read index, confirms it is still leader with a round of heartbeats, and serves the read once lastApplied catches up. No log entry is written for reads.

Closes the kvdemo stale reads issue once kvdemo uses it (next revision).`,
          hoursAfter: 0,
          commits: [
            {
              message: `Add ReadIndex for linearizable reads

A read is ready once a majority has acknowledged a heartbeat and the
state machine has applied up to the read index.`,
              author: "yuki",
              daysAgo: 28,
              changes: {
                "raft/read.go": readIndexGo,
                "raft/raft.go": [["\toutbox []Message\n", "\treads []*readRequest\n\n\toutbox []Message\n"]],
                "raft/replication.go": [["\tif !m.Success {\n", "\tn.ackReads(m.From)\n\tif !m.Success {\n"]],
              },
            },
          ],
          reviews: [
            {
              author: "priya",
              hoursAfter: 22,
              verdict: "reject",
              summary:
                "The structure is right, but two subtle problems, both of which are exactly what a lecture on this would need to get right.",
              comments: [
                {
                  body: "This counts any reply as an acknowledgement, including replies to heartbeats sent *before* the read started. Those don't prove we were still leader when the read began. You need some way to tie a reply to a heartbeat round that started after ReadIndex was called.",
                  path: "raft/read.go",
                  line: 35,
                },
                {
                  body: "A freshly elected leader's commitIndex can be behind until it commits an entry from its own term (that's what the no-op in §8 is for). Without that check this read index can be too low.",
                  path: "raft/read.go",
                  line: 25,
                },
              ],
            },
            {
              author: "self",
              hoursAfter: 26,
              summary: "Agree with priya's points. One more small thing.",
              comments: [
                {
                  body: "`keep := n.reads[:0]` reuses the backing array, which is fine here, but a comment would save the next reader a double take.",
                  path: "raft/read.go",
                  line: 42,
                },
              ],
            },
          ],
        },
        {
          description: `Addresses review:

- Heartbeats are numbered with a round counter that replies echo back. A read only counts acks from its own round or later.
- Reads wait until the leader has committed an entry from its current term. The no-op-on-election change is left for a separate patch, since it's also exercise 2.1.

Still to do: use it in kvdemo.`,
          hoursAfter: 140,
          commits: [
            {
              message: `ReadIndex: only count acks from the read's own round

Number heartbeat rounds and echo the round in AppendEntries replies,
so a reply to a heartbeat sent before the read started no longer
counts. Also wait for an entry from the current term to commit.`,
              author: "yuki",
              daysAgo: 22,
              changes: {
                "raft/read.go": readIndexGoV2,
                "raft/raft.go": [["\treads []*readRequest\n", "\treads []*readRequest\n\tround uint64\n"]],
                "raft/rpc.go": [
                  [
                    "\tMatchIndex uint64\n",
                    "\tMatchIndex uint64\n\n\t// Round numbers heartbeats so the leader can tell which replies\n\t// answer requests sent after a read started. Replies echo it.\n\tRound uint64\n",
                  ],
                ],
                "raft/replication.go": [
                  ["\tn.ackReads(m.From)\n", "\tn.ackReads(m.From, m.Round)\n"],
                  ["func (n *Node) broadcastAppend() {\n\tn.elapsed = 0\n", "func (n *Node) broadcastAppend() {\n\tn.elapsed = 0\n\tn.round++\n"],
                  ["\t\tLeaderCommit: n.commitIndex,\n", "\t\tLeaderCommit: n.commitIndex,\n\t\tRound:        n.round,\n"],
                  ["Success: true, MatchIndex: last})", "Success: true, MatchIndex: last, Round: m.Round})"],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "priya",
              hoursAfter: 30,
              summary: "Much better. One more question, then I think this is close.",
              comments: [
                {
                  body: "Calling broadcastAppend before recording the round is right, nice. But snapshot replies (sendSnapshot) don't carry a round, so a follower catching up via InstallSnapshot never acks. Probably fine, a majority without it is enough, but worth a test.",
                  path: "raft/read.go",
                  line: 29,
                },
              ],
            },
          ],
          comments: [
            {
              author: "yuki",
              body: "Good catch on snapshots. I'll add a test with one lagging follower and then wire it into kvdemo.",
              hoursAfter: 34,
            },
            {
              author: "self",
              body: "Read through r2, the round counter is much easier to follow than I expected. Looking forward to the kvdemo part.",
              hoursAfter: 50,
              reactions: [{ emoji: "🙌", by: ["yuki"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Pre-vote (behind a flag)",
      author: "theo",
      daysAgo: 18,
      labels: ["enhancement"],
      state: "draft",
      revisions: [
        {
          description:
            "First cut at pre-vote. A follower whose timer fires becomes a `PreCandidate` and asks peers whether they would vote for it in the next term, without incrementing its own. Only after a majority says yes does it start a real election. Not behind a flag yet, and CheckQuorum is still to come. Draft until the exercise 1.1 deadline.",
          hoursAfter: 0,
          commits: [
            {
              message: `Add pre-vote

A node whose election timer fires asks for pre-votes for term+1 first
and only starts a real election after a majority would vote for it.`,
              author: "theo",
              daysAgo: 18,
              changes: {
                "raft/prevote.go": prevoteGo,
                "raft/raft.go": [
                  ["\tLeader\n)", "\tLeader\n\tPreCandidate\n)"],
                  ['"follower", "candidate", "leader"}', '"follower", "candidate", "leader", "pre-candidate"}'],
                  ["\tcase Follower, Candidate:\n\t\tif n.elapsed >= n.deadline {\n\t\t\tn.startElection()\n", "\tcase Follower, Candidate, PreCandidate:\n\t\tif n.elapsed >= n.deadline {\n\t\t\tn.startPreVote()\n"],
                  ["\tcase MsgInstallSnapshot:\n", "\tcase MsgPreVote:\n\t\tn.handlePreVote(m)\n\tcase MsgPreVoteReply:\n\t\tn.handlePreVoteReply(m)\n\tcase MsgInstallSnapshot:\n"],
                ],
                "raft/rpc.go": [["\tMsgInstallSnapshot\n)", "\tMsgInstallSnapshot\n\tMsgPreVote\n\tMsgPreVoteReply\n)"]],
              },
            },
          ],
          reviews: [
            {
              author: "priya",
              hoursAfter: 16,
              summary: "Good start. A couple of things that will bite, inline.",
              comments: [
                {
                  body: "`send` overwrites `Term` with `n.currentTerm`, so this goes out with the current term, not term+1, and every peer rejects it because `m.Term > n.currentTerm` is false.",
                  path: "raft/prevote.go",
                  line: 16,
                },
                {
                  body: "The comment says \"and we have not heard from a leader recently\" but the code doesn't check that. Without it, pre-vote doesn't stop a returning node from disrupting a healthy leader, which is the whole point.",
                  path: "raft/prevote.go",
                  line: 25,
                  endLine: 28,
                },
              ],
            },
          ],
        },
        {
          description:
            "Pre-vote messages now carry term+1 for real, and Step no longer adopts the term from pre-vote messages. A node only grants a pre-vote if it hasn't heard from a leader within the minimum election timeout. Still no flag; still a draft.",
          hoursAfter: 50,
          commits: [
            {
              message: `prevote: send term+1 and respect a live leader

send() stamps the current term on every message, so pre-votes bypass
it. Step must not adopt the term from pre-vote traffic either, or the
whole thing is pointless.`,
              author: "theo",
              daysAgo: 16,
              changes: {
                "raft/prevote.go": prevoteGoV2,
                "raft/raft.go": [
                  [
                    "\tif m.Term > n.currentTerm {\n",
                    "\tif m.Term > n.currentTerm && m.Kind != MsgPreVote && m.Kind != MsgPreVoteReply {\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "priya",
              hoursAfter: 20,
              summary:
                "This works now, I ran it against the kvdemo isolate scenario and the leader stays put. Remaining before un-drafting: the config flag, and a test that fails without pre-vote.",
              comments: [
                {
                  body: "Nice. This is the line the lecture will be about.",
                  path: "raft/prevote.go",
                  line: 32,
                  endLine: 33,
                  resolved: true,
                },
                {
                  body: "Bypassing `send` means these don't get persisted first. That's fine because pre-votes don't change persistent state, but please say so in a comment, someone will \"fix\" it otherwise.",
                  path: "raft/prevote.go",
                  line: 16,
                },
              ],
            },
          ],
          comments: [
            {
              author: "theo",
              body: "Will add the flag (`Config.PreVote`) and a test that isolates a follower for 200 ticks and checks the leader's term doesn't change on heal.",
              hoursAfter: 76,
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
      title: "tiny-raft 0.1.0",
      notes: `The version used for the spring course.

- Leader election and log replication, written to follow Figure 2 line by line
- The commit rule only counts replicas for entries from the current term (§5.4.2), with a Figure 8 regression test
- A deterministic simulator: message loss, reordering, isolating nodes. Same seed, same run, every time.

Thanks to tomas for the partition helpers and yuki for finding where nondeterminism was leaking in.`,
      author: "priya",
      daysAgo: 250,
      artifacts: [
        { name: "tiny-raft-0.1.0.tar.gz", sizeBytes: 21_408 },
        { name: "lecture-notes-0.1.0.pdf", sizeBytes: 412_771 },
      ],
    },
    {
      tag: "v0.2.0",
      at: "v0.2.0",
      title: "tiny-raft 0.2.0",
      notes: `The version for the autumn course, with a new week 3 on snapshots.

**New**
- Snapshots and InstallSnapshot (§7)
- A \`Storage\` interface, so tests can crash and restart nodes
- \`sim.Trace\` for reading failing runs message by message
- \`cmd/kvdemo\`, the replicated key-value store from lecture 4
- \`make race\`

**Fixed**
- Compacting the log no longer discards entries after the snapshot point
- Stale AppendEntries replies from earlier terms are ignored
- Followers only reset their election timer when they grant a vote

If you are taking the course: please pull this before starting the week 3 exercises.`,
      author: "priya",
      daysAgo: 60,
      artifacts: [
        { name: "tiny-raft-0.2.0.tar.gz", sizeBytes: 34_952 },
        { name: "lecture-notes-0.2.0.pdf", sizeBytes: 638_204 },
        { name: "kvdemo-linux-amd64", sizeBytes: 2_271_232 },
      ],
    },
  ],
};
