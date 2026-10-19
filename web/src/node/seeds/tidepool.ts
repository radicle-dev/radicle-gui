import type { RepoSeed } from "./types";

const readme = `# tidepool

tidepool polls ocean buoy relays, keeps a rolling window of readings in
memory and serves them over a small JSON API. It is the piece that sits
between the buoys moored along the coast and the dashboards, tide tables and
surf reports that want to ask "what is the swell doing at TC-041 right now?"

## Running

    make build
    ./bin/tidepool -relays https://relay.example.net/feed.txt

Requires Go 1.22 or newer.

## Flags

| Flag | Default | Meaning |
|------|---------|---------|
| \`-addr\` | \`:8080\` | HTTP listen address |
| \`-relays\` | | Comma-separated relay feed URLs |
| \`-interval\` | \`5m\` | How often each relay is polled |

## API

See [docs/api.md](docs/api.md).

## Status

Early. The store is in-memory only, so a restart forgets everything.
`;

const goMod = `module tidal.network/tidepool

go 1.22
`;

const mainGo = `package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"time"

	"tidal.network/tidepool/internal/api"
	"tidal.network/tidepool/internal/ingest"
	"tidal.network/tidepool/internal/store"
)

var version = "dev"

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	relays := flag.String("relays", "", "comma-separated list of relay URLs to poll")
	interval := flag.Duration("interval", 5*time.Minute, "how often to poll each relay")
	flag.Parse()

	if *relays == "" {
		slog.Error("no relays configured; pass -relays")
		os.Exit(2)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	st := store.New(2048)
	ing := ingest.New(st, strings.Split(*relays, ","), *interval)
	go ing.Run(ctx)

	srv := &http.Server{Addr: *addr, Handler: api.NewServer(st)}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	slog.Info("tidepool listening", "version", version, "addr", *addr, "relays", *relays)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
`;

const ingestGo = `// Package ingest polls buoy relays and feeds their observations into a store.
package ingest

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"tidal.network/tidepool/internal/store"
)

type Ingester struct {
	store    *store.Store
	relays   []string
	interval time.Duration
	client   *http.Client
}

func New(st *store.Store, relays []string, interval time.Duration) *Ingester {
	return &Ingester{
		store:    st,
		relays:   relays,
		interval: interval,
		client:   &http.Client{},
	}
}

// Run polls every relay once per interval until ctx is cancelled.
func (in *Ingester) Run(ctx context.Context) {
	tick := time.NewTicker(in.interval)
	defer tick.Stop()
	for {
		for _, url := range in.relays {
			if err := in.poll(ctx, url); err != nil {
				slog.Warn("poll failed", "relay", url, "err", err)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func (in *Ingester) poll(ctx context.Context, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := in.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("relay returned %s", resp.Status)
	}
	obs, err := Parse(resp.Body)
	if err != nil {
		return err
	}
	for _, o := range obs {
		in.store.Append(o)
	}
	slog.Debug("polled relay", "relay", url, "observations", len(obs))
	return nil
}
`;

const parseGo = `package ingest

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"tidal.network/tidepool/internal/store"
)

// Parse reads a relay feed. Each non-comment line is one observation:
//
//	STATION  TIME                  WVHT  DPD   WTMP  PRES
//	TC-041   2025-11-02T06:10:00Z  1.4   9.0   14.2  1016.3
//
// Lines starting with '#' are headers or comments and are skipped.
func Parse(r io.Reader) ([]store.Observation, error) {
	var out []store.Observation
	sc := bufio.NewScanner(r)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		f := strings.Fields(line)
		if len(f) != 6 {
			return nil, fmt.Errorf("line %d: want 6 fields, got %d", lineNo, len(f))
		}
		t, err := time.Parse(time.RFC3339, f[1])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad time %q: %w", lineNo, f[1], err)
		}
		vals := make([]float64, 4)
		for i := range vals {
			v, err := strconv.ParseFloat(f[i+2], 64)
			if err != nil {
				return nil, fmt.Errorf("line %d: field %d: %w", lineNo, i+3, err)
			}
			vals[i] = v
		}
		out = append(out, store.Observation{
			Station:    f[0],
			Time:       t,
			WaveHeight: vals[0],
			WavePeriod: vals[1],
			WaterTemp:  vals[2],
			Pressure:   vals[3],
		})
	}
	return out, sc.Err()
}
`;

const serverGo = `// Package api serves stored observations as JSON.
package api

import (
	"encoding/json"
	"net/http"
	"time"

	"tidal.network/tidepool/internal/store"
)

type Server struct {
	store *store.Store
	mux   *http.ServeMux
}

func NewServer(st *store.Store) *Server {
	s := &Server{store: st, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /stations", s.listStations)
	s.mux.HandleFunc("GET /stations/{id}/observations", s.observations)
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) listStations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"stations": s.store.Stations()})
}

func (s *Server) observations(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	obs := s.store.Since(id, time.Now().Add(-24*time.Hour))
	if obs == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown station " + id})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"station": id, "observations": obs})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
`;

const storeGo = `// Package store keeps a bounded, in-memory window of observations per station.
package store

import (
	"sort"
	"sync"
	"time"
)

// Observation is a single reading from one buoy. Fields the buoy did not
// report are NaN.
type Observation struct {
	Station    string
	Time       time.Time
	WaveHeight float64 // metres
	WavePeriod float64 // seconds
	WaterTemp  float64 // degrees Celsius
	Pressure   float64 // hPa
}

// Store holds the most recent observations for each station in a ring buffer.
type Store struct {
	mu       sync.RWMutex
	capacity int
	stations map[string]*ring
}

type ring struct {
	buf  []Observation
	next int
	full bool
}

// New returns a store that keeps at most capacity observations per station.
func New(capacity int) *Store {
	return &Store{capacity: capacity, stations: make(map[string]*ring)}
}

// Append records an observation, overwriting the oldest one for that station
// once the buffer is full.
func (s *Store) Append(o Observation) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.stations[o.Station]
	if !ok {
		r = &ring{buf: make([]Observation, s.capacity)}
		s.stations[o.Station] = r
	}
	r.buf[r.next] = o
	r.next = (r.next + 1) % s.capacity
	if r.next == 0 {
		r.full = true
	}
}

// Since returns observations for station newer than t, oldest first.
func (s *Store) Since(station string, t time.Time) []Observation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.stations[station]
	if !ok {
		return nil
	}
	var out []Observation
	for _, o := range r.ordered() {
		if o.Time.After(t) {
			out = append(out, o)
		}
	}
	return out
}

// Stations returns the IDs of all stations seen so far, sorted.
func (s *Store) Stations() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := make([]string, 0, len(s.stations))
	for id := range s.stations {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func (r *ring) ordered() []Observation {
	if !r.full {
		return append([]Observation(nil), r.buf[:r.next]...)
	}
	return append(append([]Observation(nil), r.buf[r.next:]...), r.buf[:r.next]...)
}
`;

const storeTestGo = `package store

import (
	"testing"
	"time"
)

func obs(station string, minutes int) Observation {
	base := time.Date(2025, 11, 2, 6, 0, 0, 0, time.UTC)
	return Observation{Station: station, Time: base.Add(time.Duration(minutes) * time.Minute)}
}

func TestAppendAndSince(t *testing.T) {
	s := New(8)
	for i := 0; i < 5; i++ {
		s.Append(obs("TC-041", i*10))
	}
	got := s.Since("TC-041", obs("", 15).Time)
	if len(got) != 3 {
		t.Fatalf("want 3 observations after 06:15, got %d", len(got))
	}
}

func TestRingOverwritesOldest(t *testing.T) {
	s := New(4)
	for i := 0; i < 6; i++ {
		s.Append(obs("TC-041", i))
	}
	got := s.Since("TC-041", time.Time{})
	if len(got) != 4 {
		t.Fatalf("want 4 observations, got %d", len(got))
	}
	if got[0].Time.Minute() != 2 {
		t.Errorf("oldest kept observation should be minute 2, got %d", got[0].Time.Minute())
	}
}

func TestStationsSorted(t *testing.T) {
	s := New(2)
	for _, id := range []string{"TC-112", "TC-007", "TC-041"} {
		s.Append(obs(id, 0))
	}
	got := s.Stations()
	want := []string{"TC-007", "TC-041", "TC-112"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Stations() = %v, want %v", got, want)
		}
	}
}
`;

const apiDoc = `# HTTP API

All responses are JSON. Times are RFC 3339 in UTC.

## GET /stations

Lists every station tidepool has received at least one observation from.

    {"stations": ["TC-007", "TC-041", "TC-112"]}

## GET /stations/{id}/observations

Returns the last 24 hours of observations for one station, oldest first.

    {
      "station": "TC-041",
      "observations": [
        {"Station": "TC-041", "Time": "2025-11-02T06:10:00Z", "WaveHeight": 1.4, ...}
      ]
    }

Returns 404 if the station is unknown.
`;

const makefile = `BIN := bin/tidepool
VERSION ?= $(shell git describe --tags --always --dirty)
LDFLAGS := -ldflags "-X main.version=$(VERSION)"

.PHONY: build test run clean

build:
	go build $(LDFLAGS) -o $(BIN) ./cmd/tidepool

test:
	go test ./...

run: build
	./$(BIN) -relays http://localhost:9000/feed.txt

clean:
	rm -rf bin dist
`;

const gitignore = `/bin/
/dist/
*.test
.env
`;

const license = `Copyright 2025 Tidal Collective contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`;

const gzipGo = `package api

import (
	"compress/gzip"
	"net/http"
	"strings"
)

// acceptsGzip reports whether the client listed gzip in Accept-Encoding.
func acceptsGzip(r *http.Request) bool {
	for _, enc := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		if strings.TrimSpace(strings.SplitN(enc, ";", 2)[0]) == "gzip" {
			return true
		}
	}
	return false
}

type gzipWriter struct {
	http.ResponseWriter
	gz *gzip.Writer
}

func newGzipWriter(w http.ResponseWriter) *gzipWriter {
	w.Header().Set("Content-Encoding", "gzip")
	w.Header().Add("Vary", "Accept-Encoding")
	return &gzipWriter{ResponseWriter: w, gz: gzip.NewWriter(w)}
}

func (g *gzipWriter) Write(p []byte) (int, error) { return g.gz.Write(p) }

func (g *gzipWriter) Close() error { return g.gz.Close() }
`;

const csvGo = `package api

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"time"

	"tidal.network/tidepool/internal/store"
)

func writeCSV(w http.ResponseWriter, obs []store.Observation) {
	w.Header().Set("Content-Type", "text/csv")
	cw := csv.NewWriter(w)
	cw.Write([]string{"time", "wave_height_m", "wave_period_s", "water_temp_c", "pressure_hpa"})
	for _, o := range obs {
		cw.Write([]string{
			o.Time.Format(time.RFC3339),
			strconv.FormatFloat(o.WaveHeight, 'f', 2, 64),
			strconv.FormatFloat(o.WavePeriod, 'f', 2, 64),
			strconv.FormatFloat(o.WaterTemp, 'f', 2, 64),
			strconv.FormatFloat(o.Pressure, 'f', 2, 64),
		})
	}
	cw.Flush()
}
`;

const snapshotGo = `package store

import (
	"encoding/gob"
	"os"
)

type snapshot struct {
	Capacity int
	Stations map[string][]Observation
}

// Save writes every station's observations to path.
func (s *Store) Save(path string) error {
	s.mu.RLock()
	snap := snapshot{Capacity: s.capacity, Stations: make(map[string][]Observation, len(s.stations))}
	for id, r := range s.stations {
		snap.Stations[id] = r.ordered()
	}
	s.mu.RUnlock()

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return gob.NewEncoder(f).Encode(snap)
}

// Load appends the observations from a snapshot written by Save.
func (s *Store) Load(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	var snap snapshot
	if err := gob.NewDecoder(f).Decode(&snap); err != nil {
		return err
	}
	for _, obs := range snap.Stations {
		for _, o := range obs {
			s.Append(o)
		}
	}
	return nil
}
`;

const sourceGo = `package ingest

import (
	"context"

	"tidal.network/tidepool/internal/store"
)

// A Source delivers observations to the store. The HTTP relay poller is one
// source; push-based transports like MQTT are another.
type Source interface {
	Run(ctx context.Context, sink func(store.Observation)) error
}
`;

const mqttGo = `package ingest

import (
	"context"
	"errors"
	"strings"

	"tidal.network/tidepool/internal/store"
)

// MQTTSource subscribes to buoy topics on a broker. Each message payload is a
// single feed line in the same format Parse accepts.
//
// TODO(sol): pick a client library. Everything below the subscribe call is
// written against a hypothetical Subscribe(topic, handler) API for now.
type MQTTSource struct {
	Broker string // e.g. tcp://broker.harbour.lan:1883
	Topic  string // e.g. buoys/+/obs
}

func (m *MQTTSource) Run(ctx context.Context, sink func(store.Observation)) error {
	if m.Broker == "" {
		return errors.New("mqtt: no broker configured")
	}
	handle := func(payload []byte) {
		obs, err := Parse(strings.NewReader(string(payload)))
		if err != nil {
			return // TODO: count and log malformed messages
		}
		for _, o := range obs {
			sink(o)
		}
	}
	_ = handle
	<-ctx.Done()
	return ctx.Err()
}
`;

export const tidepool: RepoSeed = {
  owner: { org: "tidal-collective" },
  name: "tidepool",
  description:
    "Ingests ocean buoy sensor feeds and serves wave, temperature and pressure readings over a small HTTP API.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["kofi", "lena"],
  threshold: 1,
  seeding: 25,
  files: {
    "README.md": readme,
    "go.mod": goMod,
    "cmd/tidepool/main.go": mainGo,
    "internal/ingest/ingest.go": ingestGo,
    "internal/ingest/parse.go": parseGo,
    "internal/api/server.go": serverGo,
    "internal/store/store.go": storeGo,
    "internal/store/store_test.go": storeTestGo,
    "docs/api.md": apiDoc,
    Makefile: makefile,
    ".gitignore": gitignore,
    LICENSE: license,
  },
  root: {
    label: "root",
    message: `Initial import of tidepool

Polls one or more buoy relays, keeps the last 2048 readings per station in
a ring buffer and serves them over two JSON endpoints. Rough around the
edges, but it has been running against the harbour relay for a week
without falling over.`,
    author: "kofi",
    daysAgo: 300,
  },
  history: [
    {
      label: "missing-values",
      message: `ingest: treat MM as a missing reading

Relays write "MM" when a sensor did not report, which made Parse reject
the whole feed. Store those fields as NaN instead so one dead wave sensor
does not hide the temperature and pressure readings next to it.`,
      author: "kofi",
      daysAgo: 285,
      changes: {
        "internal/ingest/parse.go": [
          ['\t"io"\n', '\t"io"\n\t"math"\n'],
          [
            "\t\t\tv, err := strconv.ParseFloat(f[i+2], 64)",
            '\t\t\tif f[i+2] == "MM" {\n\t\t\t\tvals[i] = math.NaN()\n\t\t\t\tcontinue\n\t\t\t}\n\t\t\tv, err := strconv.ParseFloat(f[i+2], 64)',
          ],
        ],
      },
    },
    {
      label: "null-json",
      message: `api: encode missing readings as null

encoding/json refuses to encode NaN, so any station with a dead sensor
answered /observations with a 500 and an empty body. Map observations to
a response type with pointer fields and snake_case names, which is what
the dashboard folks asked for anyway.

Fixes the 500 reported against TC-007.`,
      author: "kofi",
      daysAgo: 280,
      changes: {
        "internal/api/server.go": [
          ['\t"encoding/json"\n', '\t"encoding/json"\n\t"math"\n'],
          ['"observations": obs})', '"observations": toJSON(obs)})'],
          [
            "\tjson.NewEncoder(w).Encode(v)\n}\n",
            `\tjson.NewEncoder(w).Encode(v)
}

// observationJSON mirrors store.Observation but reports missing readings as
// null instead of NaN, which encoding/json refuses to encode.
type observationJSON struct {
	Time       time.Time \`json:"time"\`
	WaveHeight *float64  \`json:"wave_height_m"\`
	WavePeriod *float64  \`json:"wave_period_s"\`
	WaterTemp  *float64  \`json:"water_temp_c"\`
	Pressure   *float64  \`json:"pressure_hpa"\`
}

func toJSON(obs []store.Observation) []observationJSON {
	out := make([]observationJSON, len(obs))
	for i, o := range obs {
		out[i] = observationJSON{
			Time:       o.Time,
			WaveHeight: opt(o.WaveHeight),
			WavePeriod: opt(o.WavePeriod),
			WaterTemp:  opt(o.WaterTemp),
			Pressure:   opt(o.Pressure),
		}
	}
	return out
}

func opt(v float64) *float64 {
	if math.IsNaN(v) {
		return nil
	}
	return &v
}
`,
          ],
        ],
        "docs/api.md": [
          [
            '        {"Station": "TC-041", "Time": "2025-11-02T06:10:00Z", "WaveHeight": 1.4, ...}',
            '        {"time": "2025-11-02T06:10:00Z", "wave_height_m": 1.4, "wave_period_s": 9.0, "water_temp_c": 14.2, "pressure_hpa": null}',
          ],
          [
            "Returns 404 if the station is unknown.\n",
            "Readings the buoy did not report are `null`.\n\nReturns 404 if the station is unknown.\n",
          ],
        ],
      },
    },
    {
      label: "makefile-lint",
      message: `Makefile: add a lint target

go vet plus staticcheck. Not wired into anything yet, but it caught an
unchecked error in the shutdown path on the first run, so it earns its
keep.`,
      author: "lena",
      daysAgo: 270,
      changes: {
        Makefile: [
          [".PHONY: build test run clean", ".PHONY: build test lint run clean"],
          [
            "test:\n\tgo test ./...\n",
            "test:\n\tgo test ./...\n\nlint:\n\tgo vet ./...\n\tstaticcheck ./...\n",
          ],
        ],
      },
    },
    {
      label: "api-since",
      message: `api: accept a since parameter on /observations

?since=6h narrows the window, anything time.ParseDuration understands
works. The default stays at 24h so existing clients see no change.`,
      author: "lena",
      daysAgo: 250,
      changes: {
        "internal/api/server.go": [
          [
            "\tobs := s.store.Since(id, time.Now().Add(-24*time.Hour))",
            `\twindow := 24 * time.Hour
	if v := r.URL.Query().Get("since"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "since must be a positive duration like 6h or 90m"})
			return
		}
		window = d
	}
	obs := s.store.Since(id, time.Now().Add(-window))`,
          ],
        ],
      },
    },
    {
      label: "docs-since",
      message: "docs: describe the since parameter",
      author: "lena",
      daysAgo: 245,
      changes: {
        "docs/api.md": [
          [
            "Returns the last 24 hours of observations for one station, oldest first.",
            "Returns observations for one station, oldest first. By default that is\nthe last 24 hours; pass `since` with a Go duration to change it:\n\n    GET /stations/TC-041/observations?since=6h\n\nAn invalid or non-positive `since` returns 400.",
          ],
        ],
      },
    },
    {
      label: "station-case",
      message: `Normalise station IDs to upper case

Some relays send "tc-041", others "TC-041", and URLs typed by hand are
usually lower case. Upper-case IDs both when parsing feeds and when
looking them up in the API so they all land on the same ring buffer.`,
      author: "lena",
      daysAgo: 230,
      changes: {
        "internal/api/server.go": [
          ['\t"net/http"\n', '\t"net/http"\n\t"strings"\n'],
          [
            '\tid := r.PathValue("id")',
            '\tid := strings.ToUpper(r.PathValue("id"))',
          ],
        ],
        "internal/ingest/parse.go": [
          [
            "\t\t\tStation:    f[0],",
            "\t\t\tStation:    strings.ToUpper(f[0]),",
          ],
        ],
      },
    },
    {
      label: "store-evict",
      message: `store: never return readings older than the retention window

A station that goes quiet keeps its ring buffer around forever, so
?since=720h happily returned month-old data from a buoy that was pulled
for maintenance. Clamp queries to a Retention window (72h by default)
so stale readings stop leaking into charts.

Tests that use fixed timestamps disable retention explicitly.`,
      author: "kofi",
      daysAgo: 220,
      changes: {
        "internal/store/store.go": [
          [
            "\tcapacity int\n",
            "\tcapacity int\n\t// Retention is how long observations stay visible to Since. Zero means\n\t// they are visible until the ring buffer overwrites them.\n\tRetention time.Duration\n",
          ],
          [
            "return &Store{capacity: capacity, stations:",
            "return &Store{capacity: capacity, Retention: 72 * time.Hour, stations:",
          ],
          [
            "\tvar out []Observation\n",
            "\tif s.Retention > 0 {\n\t\tif cutoff := time.Now().Add(-s.Retention); t.Before(cutoff) {\n\t\t\tt = cutoff\n\t\t}\n\t}\n\tvar out []Observation\n",
          ],
        ],
        "internal/store/store_test.go": [
          ["\ts := New(8)\n", "\ts := New(8)\n\ts.Retention = 0\n"],
          ["\ts := New(4)\n", "\ts := New(4)\n\ts.Retention = 0\n"],
          [
            "func TestStationsSorted(",
            `func TestRetentionClampsSince(t *testing.T) {
	s := New(8)
	s.Retention = time.Hour
	now := time.Now()
	s.Append(Observation{Station: "TC-041", Time: now.Add(-3 * time.Hour)})
	s.Append(Observation{Station: "TC-041", Time: now.Add(-10 * time.Minute)})
	got := s.Since("TC-041", time.Time{})
	if len(got) != 1 {
		t.Fatalf("want only the reading inside the retention window, got %d", len(got))
	}
}

func TestStationsSorted(`,
          ],
        ],
      },
    },
    {
      label: "gzip-api",
      message: `api: gzip responses when the client accepts it

A week of 10-minute readings for every station is a few hundred KB of
JSON, which the cellular uplink on the harbour dashboard does not enjoy.
Compressing cuts /observations?since=168h from 412 KB to 38 KB.`,
      author: "tomas",
      daysAgo: 190,
      changes: {
        "internal/api/gzip.go": gzipGo,
        "internal/api/server.go": [
          [
            "\ts.mux.ServeHTTP(w, r)",
            "\tif acceptsGzip(r) {\n\t\tgz := newGzipWriter(w)\n\t\tdefer gz.Close()\n\t\tw = gz\n\t}\n\ts.mux.ServeHTTP(w, r)",
          ],
        ],
      },
    },
    {
      label: "go123",
      message: `Require Go 1.23

We want the range-over-func iterators for the store rewrite, and both
deploy hosts are on 1.23 already.`,
      author: "kofi",
      daysAgo: 160,
      changes: {
        "go.mod": [["go 1.22", "go 1.23"]],
        "README.md": [
          ["Requires Go 1.22 or newer.", "Requires Go 1.23 or newer."],
        ],
      },
    },
    {
      label: "health",
      message: `api: add /healthz

Returns 204 as long as the process is serving. The orchestrator on the
east-shore box restarts anything without a health check every few hours,
which is how we found out it needed one.`,
      author: "lena",
      daysAgo: 140,
      changes: {
        "internal/api/server.go": [
          [
            '\ts.mux.HandleFunc("GET /stations", s.listStations)',
            '\ts.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {\n\t\tw.WriteHeader(http.StatusNoContent)\n\t})\n\ts.mux.HandleFunc("GET /stations", s.listStations)',
          ],
        ],
        "docs/api.md": [
          [
            "## GET /stations\n",
            "## GET /healthz\n\nReturns 204 with an empty body while the server is up. Use it for\nliveness probes; it does not check that relays are reachable.\n\n## GET /stations\n",
          ],
        ],
      },
    },
    {
      label: "parse-minute",
      message: `ingest: accept timestamps without seconds

The two older relays on the north breakwater write "2025-11-02T06:10Z".
time.RFC3339 rejects that, so every line from them was dropped. Try
RFC 3339 first and fall back to minute precision.`,
      author: "yuki",
      daysAgo: 125,
      changes: {
        "internal/ingest/parse.go": [
          [
            "\t\tt, err := time.Parse(time.RFC3339, f[1])",
            "\t\tt, err := parseTime(f[1])",
          ],
          [
            "\treturn out, sc.Err()\n}\n",
            `\treturn out, sc.Err()
}

// Some older relays drop the seconds from timestamps ("2025-11-02T06:10Z").
var timeLayouts = []string{time.RFC3339, "2006-01-02T15:04Z07:00"}

func parseTime(s string) (time.Time, error) {
	var err error
	for _, layout := range timeLayouts {
		var t time.Time
		if t, err = time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, err
}
`,
          ],
        ],
      },
    },
    {
      label: "parse-minute-docs",
      message: `README: document the feed format

Including the minute-precision timestamps we now accept.`,
      author: "yuki",
      daysAgo: 124,
      changes: {
        "README.md": [
          [
            "## API\n",
            `## Feed format

Relays serve plain text, one observation per line, whitespace separated:

    #STATION TIME                 WVHT DPD  WTMP PRES
    TC-041   2025-11-02T06:10:00Z 1.4  9.0  14.2 1016.3
    TC-007   2025-11-02T06:10Z    MM   7.5  13.8 1015.9

Timestamps are RFC 3339, with or without seconds. \`MM\` marks a reading the
sensor did not report. Lines starting with \`#\` are ignored.

## API
`,
          ],
        ],
      },
    },
    {
      label: "ingest-backoff",
      message: `ingest: time out slow relays and back off on failure

The default http.Client has no timeout, so one relay that accepted the
connection and then went silent stalled polling for every other station
until the TCP keepalive gave up, about two hours later.

Give requests 20 seconds, and skip a relay that keeps failing for
2, 4, 8 ... up to 32 intervals before trying it again.`,
      author: "kofi",
      daysAgo: 95,
      changes: {
        "internal/ingest/ingest.go": [
          [
            "\tclient   *http.Client\n}",
            "\tclient   *http.Client\n\n\t// failures counts consecutive errors per relay; skip is how many more\n\t// rounds that relay sits out.\n\tfailures map[string]int\n\tskip     map[string]int\n}",
          ],
          [
            "\t\tclient:   &http.Client{},\n",
            "\t\tclient:   &http.Client{Timeout: 20 * time.Second},\n\t\tfailures: make(map[string]int),\n\t\tskip:     make(map[string]int),\n",
          ],
          [
            '\t\t\tif err := in.poll(ctx, url); err != nil {\n\t\t\t\tslog.Warn("poll failed", "relay", url, "err", err)\n\t\t\t}\n',
            `\t\t\tif in.skip[url] > 0 {
				in.skip[url]--
				continue
			}
			if err := in.poll(ctx, url); err != nil {
				in.failures[url]++
				in.skip[url] = min(1<<in.failures[url], 32)
				slog.Warn("poll failed", "relay", url, "err", err, "skip", in.skip[url])
				continue
			}
			in.failures[url] = 0
`,
          ],
        ],
      },
    },
    {
      label: "retention-flag",
      message: `Add a -retention flag

Some deployments only care about the last few hours; the research group
wants a week. Defaults to the existing 72h.`,
      author: "lena",
      daysAgo: 70,
      changes: {
        "cmd/tidepool/main.go": [
          [
            "\tflag.Parse()",
            '\tretention := flag.Duration("retention", 72*time.Hour, "how long readings stay queryable")\n\tflag.Parse()',
          ],
          [
            "\tst := store.New(2048)\n",
            "\tst := store.New(2048)\n\tst.Retention = *retention\n",
          ],
        ],
        "README.md": [
          [
            "| How often each relay is polled |\n",
            "| How often each relay is polled |\n| \`-retention\` | \`72h\` | How long readings stay queryable |\n",
          ],
        ],
      },
    },
    {
      label: "make-dist",
      message: `Makefile: add a dist target

Cross-compiles the four binaries we attach to releases, so cutting one
no longer depends on whatever is in Kofi's shell history.`,
      author: "kofi",
      daysAgo: 50,
      changes: {
        Makefile: [
          [
            ".PHONY: build test lint run clean",
            ".PHONY: build test lint run dist clean",
          ],
          [
            "clean:\n",
            `dist:
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o dist/linux-amd64/tidepool ./cmd/tidepool
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o dist/linux-arm64/tidepool ./cmd/tidepool
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o dist/darwin-amd64/tidepool ./cmd/tidepool
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o dist/darwin-arm64/tidepool ./cmd/tidepool

clean:
`,
          ],
        ],
      },
    },
    {
      label: "readme-v02",
      message: `README: update status for 0.2.0`,
      author: "kofi",
      daysAgo: 45,
      changes: {
        "README.md": [
          [
            "Early. The store is in-memory only, so a restart forgets everything.\n",
            `Running in production for two coastal monitoring groups since spring. The
store is still in-memory only, so a restart forgets everything; see the
persistence discussion in the issues.

## Releases

Prebuilt binaries for Linux and macOS (amd64 and arm64) are attached to
each release. Build your own with \`make dist\`.
`,
          ],
        ],
      },
    },
    {
      label: "stations-meta",
      message: `api: include last-seen time in /stations

Dashboards were fetching /observations for every station just to grey
out the ones that went quiet. /stations now returns objects with the
time of each station's newest reading.

This changes the shape of the /stations response; the old bare list of
IDs is gone.`,
      author: "lena",
      daysAgo: 20,
      changes: {
        "internal/store/store.go": [
          [
            "func (r *ring) ordered() []Observation {",
            `// LastSeen returns the time of the newest observation for station, or the
// zero time if the station is unknown.
func (s *Store) LastSeen(station string) time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.stations[station]
	if !ok || (r.next == 0 && !r.full) {
		return time.Time{}
	}
	return r.buf[(r.next-1+s.capacity)%s.capacity].Time
}

func (r *ring) ordered() []Observation {`,
          ],
        ],
        "internal/api/server.go": [
          [
            '\twriteJSON(w, http.StatusOK, map[string]any{"stations": s.store.Stations()})',
            `\ttype station struct {
		ID       string    \`json:"id"\`
		LastSeen time.Time \`json:"last_seen"\`
	}
	ids := s.store.Stations()
	out := make([]station, len(ids))
	for i, id := range ids {
		out[i] = station{ID: id, LastSeen: s.store.LastSeen(id)}
	}
	writeJSON(w, http.StatusOK, map[string]any{"stations": out})`,
          ],
        ],
        "docs/api.md": [
          [
            '    {"stations": ["TC-007", "TC-041", "TC-112"]}',
            '    {"stations": [\n      {"id": "TC-007", "last_seen": "2025-11-02T06:10:00Z"},\n      {"id": "TC-041", "last_seen": "2025-11-02T06:20:00Z"}\n    ]}',
          ],
        ],
      },
    },
    {
      label: "ignore-cover",
      message: "Ignore coverage output",
      author: "kofi",
      daysAgo: 10,
      changes: {
        ".gitignore": [["*.test\n", "*.test\ncover.out\n"]],
      },
    },
  ],
  issues: [
    {
      title: "/observations returns 500 for stations with a dead sensor",
      author: "tomas",
      daysAgo: 283,
      body: `Since the MM change, \`GET /stations/TC-007/observations\` returns a 500 with an empty body. TC-007's wave sensor has been out since the storm last week, so every reading has \`WaveHeight: NaN\`.

Log line:

    json: unsupported value: NaN

Other stations are fine.`,
      labels: ["bug"],
      assignees: ["kofi"],
      state: "solved",
      closedHoursAfter: 70,
      comments: [
        {
          author: "kofi",
          body: "Ah, of course. encoding/json has opinions about NaN. I'll switch the response to pointer fields so missing readings come out as null. Probably worth renaming the fields to snake_case while we're breaking things.",
          hoursAfter: 3,
        },
        {
          author: "tomas",
          body: "Please do, the dashboard code is full of `obs.WaveHeight` vs `wave_height` shims already.",
          hoursAfter: 5,
          replyTo: 0,
          reactions: [{ emoji: "😅", by: ["lena"] }],
        },
        {
          author: "kofi",
          body: "Fixed in null-json on main. Fields are now `wave_height_m`, `wave_period_s`, `water_temp_c`, `pressure_hpa`.",
          hoursAfter: 70,
        },
      ],
    },
    {
      title: "Lower-case station IDs return 404",
      author: "oskar",
      daysAgo: 234,
      body: `\`/stations/tc-041/observations\` returns \`unknown station tc-041\` while \`/stations/TC-041/observations\` works. The harbour relay also started sending lower-case IDs after their firmware update, so those readings end up under a separate station.`,
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 98,
      comments: [
        {
          author: "lena",
          body: "Two bugs for the price of one. I'll normalise to upper case on both sides; station IDs are case-insensitive in every relay spec I've seen.",
          hoursAfter: 6,
        },
        {
          author: "oskar",
          body: "Confirmed fixed on my end, thanks!",
          hoursAfter: 98,
          reactions: [{ emoji: "🎉", by: ["lena", "kofi"] }],
        },
      ],
    },
    {
      title: "One slow relay stalls polling for every other relay",
      author: "mira",
      daysAgo: 110,
      body: `We had the north breakwater relay accept connections but never send a response for most of Saturday. During that time none of the other stations updated either; \`/stations\` showed everything frozen at 09:40.

Looks like polling is sequential and there's no timeout on the HTTP client.`,
      labels: ["bug", "ingest"],
      assignees: ["kofi"],
      state: "solved",
      closedHoursAfter: 362,
      comments: [
        {
          author: "kofi",
          body: "Yep, `&http.Client{}` with no timeout. Embarrassing. I'll add a timeout and some backoff so a dead relay doesn't get hammered every five minutes either.",
          hoursAfter: 4,
        },
        {
          author: "yuki",
          body: "Would polling relays concurrently be worth it? We're at 9 relays now.",
          hoursAfter: 20,
        },
        {
          author: "kofi",
          body: "Maybe later. With a 20s timeout the worst case for a full round is still well inside the 5 minute interval, and sequential keeps the logs readable.",
          hoursAfter: 26,
          replyTo: 1,
        },
      ],
    },
    {
      title: "TC-112 reports water temperature around 287 °C",
      author: "sol",
      daysAgo: 75,
      body: "Every reading from TC-112 since yesterday has `water_temp_c` between 286 and 289. Unless the bay is boiling, something is reporting Kelvin.",
      labels: ["data"],
      state: "closed",
      closedHoursAfter: 30,
      comments: [
        {
          author: "lena",
          body: "Not ours: the TC-112 relay got a config reset during maintenance and is sending raw sensor units. I've emailed the people who run it. Closing here since tidepool is passing through what it's given.",
          hoursAfter: 22,
        },
        {
          author: "sol",
          body: "Fair. Might be worth a sanity range check at ingest at some point, but not urgent.",
          hoursAfter: 30,
        },
      ],
    },
    {
      title: "Expose ingest metrics",
      author: "lena",
      daysAgo: 58,
      body: `It would help to have a \`/metrics\` endpoint in the OpenMetrics text format, at least:

- polls per relay, by outcome (ok / http error / parse error / timeout)
- observations ingested per station
- current backoff per relay
- ring buffer fill per station

Right now the only way to know a relay is in backoff is grepping logs.`,
      labels: ["enhancement"],
      assignees: ["kofi"],
      comments: [
        {
          author: "kofi",
          body: "Agreed. I'd like to avoid pulling in a metrics library for six counters, the text format is simple enough to write by hand.",
          hoursAfter: 10,
          reactions: [{ emoji: "👍", by: ["lena", "tomas"] }],
        },
      ],
    },
    {
      title: "Observations lost across restarts",
      author: "yuki",
      daysAgo: 40,
      body: `Every deploy wipes the store, so for the first few hours after a restart the charts only show what's come in since. With a 72h retention window that's a long time to have a gap.

Options I can think of:

1. Snapshot the ring buffers to disk on shutdown, load on start.
2. Re-fetch history from relays on start (only some relays keep more than the latest reading).
3. Real storage (SQLite or similar).

1 seems like the smallest step.`,
      labels: ["enhancement", "store"],
      assignees: ["yuki"],
      comments: [
        {
          author: "kofi",
          body: "1 sounds right. I'd keep it optional behind a flag so the stateless deployments stay stateless.",
          hoursAfter: 8,
        },
        {
          author: "self",
          body: "+1 for option 1. We run tidepool on a small box that reboots nightly for updates, and the morning charts always start at 04:00. Happy to test a patch.",
          hoursAfter: 50,
          reactions: [{ emoji: "👍", by: ["yuki"] }],
        },
      ],
    },
    {
      title: "Document retention semantics",
      author: "tomas",
      daysAgo: 15,
      body: "It's not obvious from the docs that `since` is clamped to the retention window. I asked for `since=168h` and got three days back with no hint why. Either document it in docs/api.md or return a header saying the window was clamped.",
      labels: ["docs", "good first issue"],
      comments: [
        {
          author: "lena",
          body: "Both, probably. A `Tidepool-Window` response header with the effective duration would be cheap.",
          hoursAfter: 12,
        },
      ],
    },
  ],
  patches: [
    {
      title: "api: gzip responses when the client accepts it",
      author: "tomas",
      daysAgo: 192,
      labels: ["api"],
      state: "merged",
      revisions: [
        {
          description:
            "The harbour dashboard runs on a cellular uplink and a week of readings is a lot of JSON. This wraps the mux in a gzip writer when the request lists gzip in Accept-Encoding.\n\n/observations?since=168h for TC-041: 412 KB → 38 KB.",
          hoursAfter: 0,
          fromHistory: ["gzip-api"],
          reviews: [
            {
              author: "lena",
              hoursAfter: 20,
              verdict: "accept",
              summary: "Nice and small. One note, otherwise good to go.",
              comments: [
                {
                  body: "Good call on `Vary`. Without it the cache in front of the east-shore box would hand gzip bodies to clients that didn't ask for them.",
                  path: "internal/api/gzip.go",
                  line: 26,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "tomas",
              body: "I left /healthz compressed too, it's an empty body so it doesn't matter.",
              hoursAfter: 2,
            },
          ],
        },
      ],
    },
    {
      title: "ingest: accept timestamps without seconds",
      author: "yuki",
      daysAgo: 126,
      labels: ["ingest"],
      state: "merged",
      revisions: [
        {
          description:
            "The north breakwater relays write minute-precision timestamps (`2025-11-02T06:10Z`), so every line from them failed to parse. This tries RFC 3339 first and falls back to minute precision, and documents the feed format in the README while I was there.",
          hoursAfter: 0,
          fromHistory: ["parse-minute", "parse-minute-docs"],
          reviews: [
            {
              author: "kofi",
              hoursAfter: 18,
              verdict: "accept",
              summary:
                "Thanks, those relays have been silently dropped for longer than I'd like to admit.",
              comments: [
                {
                  body: "Returning the last layout's error means the message says it failed the minute layout even for a line that's just garbage. Fine for now, but worth remembering if someone files a confusing log line.",
                  path: "internal/ingest/parse.go",
                  line: 74,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "api: CSV export for observations",
      author: "oskar",
      daysAgo: 9,
      labels: ["api", "enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "Adds `?format=csv` to `/stations/{id}/observations`. The harbour office pastes these into a spreadsheet every Monday and has been converting JSON by hand.",
          hoursAfter: 0,
          base: "ignore-cover",
          commits: [
            {
              label: "csv-1",
              message: `api: add CSV output for observations

?format=csv returns the same window as the JSON response, one row per
reading.`,
              author: "oskar",
              daysAgo: 9,
              changes: {
                "internal/api/csv.go": csvGo,
                "internal/api/server.go": [
                  [
                    '\twriteJSON(w, http.StatusOK, map[string]any{"station": id, "observations": toJSON(obs)})',
                    '\tif r.URL.Query().Get("format") == "csv" {\n\t\twriteCSV(w, obs)\n\t\treturn\n\t}\n\twriteJSON(w, http.StatusOK, map[string]any{"station": id, "observations": toJSON(obs)})',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "lena",
              hoursAfter: 14,
              summary: "Useful, thanks! A couple of things before it goes in.",
              comments: [
                {
                  body: "Missing readings will come out as the literal string `NaN` here. Empty cells are what spreadsheets expect.",
                  path: "internal/api/csv.go",
                  line: 19,
                  endLine: 22,
                },
                {
                  body: "Could we set `Content-Disposition: attachment; filename=TC-041.csv`? Otherwise browsers show it inline and people end up with `observations` as the filename.",
                  path: "internal/api/csv.go",
                  line: 13,
                },
              ],
            },
          ],
          comments: [
            {
              author: "self",
              body: "This would replace a very fragile spreadsheet macro on our side. Tried it against our local deployment and it opens fine in a spreadsheet.",
              hoursAfter: 20,
              reactions: [{ emoji: "🙌", by: ["oskar"] }],
            },
          ],
        },
        {
          description:
            "Missing readings are now empty cells, pressure keeps one decimal like the feed, and the response is sent as an attachment named after the station. Also documented the parameter.",
          hoursAfter: 31,
          commits: [
            {
              label: "csv-2",
              message: `api: empty cells for missing CSV readings

Also name the download after the station and document ?format=csv.`,
              author: "oskar",
              daysAgo: 8,
              changes: {
                "internal/api/csv.go": [
                  [
                    'func writeCSV(w http.ResponseWriter, obs []store.Observation) {\n\tw.Header().Set("Content-Type", "text/csv")',
                    'func writeCSV(w http.ResponseWriter, station string, obs []store.Observation) {\n\tw.Header().Set("Content-Type", "text/csv; charset=utf-8")\n\tw.Header().Set("Content-Disposition", "attachment; filename="+station+".csv")',
                  ],
                  [
                    "\t\t\tstrconv.FormatFloat(o.WaveHeight, 'f', 2, 64),\n\t\t\tstrconv.FormatFloat(o.WavePeriod, 'f', 2, 64),\n\t\t\tstrconv.FormatFloat(o.WaterTemp, 'f', 2, 64),\n\t\t\tstrconv.FormatFloat(o.Pressure, 'f', 2, 64),",
                    "\t\t\tcell(o.WaveHeight, 2),\n\t\t\tcell(o.WavePeriod, 1),\n\t\t\tcell(o.WaterTemp, 1),\n\t\t\tcell(o.Pressure, 1),",
                  ],
                  [
                    "\tcw.Flush()\n}\n",
                    "\tcw.Flush()\n}\n\n// cell formats a reading, leaving missing (NaN) readings empty.\nfunc cell(v float64, prec int) string {\n\tif math.IsNaN(v) {\n\t\treturn \"\"\n\t}\n\treturn strconv.FormatFloat(v, 'f', prec, 64)\n}\n",
                  ],
                  ['\t"encoding/csv"\n', '\t"encoding/csv"\n\t"math"\n'],
                ],
                "internal/api/server.go": [
                  ["\t\twriteCSV(w, obs)", "\t\twriteCSV(w, id, obs)"],
                ],
                "docs/api.md": [
                  [
                    "An invalid or non-positive `since` returns 400.",
                    "An invalid or non-positive `since` returns 400.\n\nPass `format=csv` to get the same readings as a CSV download, one row\nper reading. Missing readings are empty cells.",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "kofi",
              hoursAfter: 40,
              verdict: "accept",
              summary:
                "LGTM. The station ID is already upper-cased and validated by the lookup, so putting it in the header is safe.",
            },
            {
              author: "lena",
              hoursAfter: 44,
              summary: "Looks good. One last nit, then I'll merge.",
              comments: [
                {
                  body: "Nit: the header row still says `wave_height_m` etc. but the precision differs per column now. Maybe a short comment above the header noting the rounding, so nobody 'fixes' it back to 2 decimals.",
                  path: "internal/api/csv.go",
                  line: 17,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "store: snapshot ring buffers to disk on shutdown",
      author: "yuki",
      daysAgo: 4,
      labels: ["store", "enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "First step for the restart-gap issue. With `-snapshot path`, tidepool writes every station's buffer to a gob file on SIGINT and loads it back on start. Without the flag nothing changes.\n\nNot done yet: periodic snapshots (a crash still loses everything), and a format version.",
          hoursAfter: 0,
          base: "ignore-cover",
          commits: [
            {
              label: "snap-1",
              message: `store: add Save and Load

Gob-encodes each station's readings, oldest first, so Load can replay
them through Append and get the same ring order back.`,
              author: "yuki",
              daysAgo: 4,
              changes: {
                "internal/store/snapshot.go": snapshotGo,
              },
            },
            {
              label: "snap-2",
              message: `Add a -snapshot flag

Loads the snapshot at startup if it exists and saves it after the HTTP
server has shut down.`,
              author: "yuki",
              daysAgo: 4,
              changes: {
                "cmd/tidepool/main.go": [
                  [
                    "\tflag.Parse()",
                    '\tsnapshot := flag.String("snapshot", "", "file to save readings to on shutdown and load them from on start")\n\tflag.Parse()',
                  ],
                  [
                    "\tst.Retention = *retention\n",
                    '\tst.Retention = *retention\n\tif *snapshot != "" {\n\t\tif err := st.Load(*snapshot); err != nil && !os.IsNotExist(err) {\n\t\t\tslog.Warn("could not load snapshot", "path", *snapshot, "err", err)\n\t\t}\n\t}\n',
                  ],
                  [
                    "\t\tsrv.Shutdown(shutdownCtx)\n",
                    '\t\tsrv.Shutdown(shutdownCtx)\n\t\tif *snapshot != "" {\n\t\t\tif err := st.Save(*snapshot); err != nil {\n\t\t\t\tslog.Error("could not save snapshot", "path", *snapshot, "err", err)\n\t\t\t}\n\t\t}\n',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "kofi",
              hoursAfter: 16,
              summary:
                "Right shape, and I like that it's opt-in. Two things I'd want before merging, the rest can be follow-ups.",
              comments: [
                {
                  body: 'If the process gets killed halfway through this write we\'re left with a truncated file and Load fails on the next start. Write to `path + ".tmp"`, fsync, then rename over the old one.',
                  path: "internal/store/snapshot.go",
                  line: 22,
                },
                {
                  body: "`defer f.Close()` drops the close error, which on some filesystems is where a failed write actually shows up. Check it explicitly.",
                  path: "internal/store/snapshot.go",
                  line: 26,
                },
                {
                  body: "Can we put a version field in here now? Adding one later means guessing which files predate it.",
                  path: "internal/store/snapshot.go",
                  line: 8,
                  endLine: 11,
                },
              ],
            },
            {
              author: "lena",
              hoursAfter: 22,
              summary: "+1 to Kofi's comments.",
              comments: [
                {
                  body: "This only runs on Ctrl-C: NotifyContext above listens for os.Interrupt, and most service managers stop us with SIGTERM, so in production the snapshot would never be written. Add syscall.SIGTERM there.",
                  path: "cmd/tidepool/main.go",
                  line: 52,
                  endLine: 56,
                },
              ],
            },
          ],
          comments: [
            {
              author: "yuki",
              body: "All fair. I'll do the tmp+rename, a version field and SIGTERM in the next revision. Leaving periodic snapshots for a follow-up unless anyone objects.",
              hoursAfter: 25,
              reactions: [{ emoji: "👍", by: ["kofi", "lena"] }],
            },
          ],
        },
      ],
    },
    {
      title: "WIP: ingest from an MQTT broker",
      author: "sol",
      daysAgo: 2,
      labels: ["ingest"],
      state: "draft",
      revisions: [
        {
          description:
            "Sketch, not ready for review. The new buoys on the south reef publish over MQTT instead of serving a feed. This introduces a `Source` interface and a stub MQTT source that reuses Parse for payloads. Doesn't connect to anything yet; I haven't picked a client library.",
          hoursAfter: 0,
          base: "ignore-cover",
          commits: [
            {
              label: "mqtt-1",
              message: `ingest: sketch a Source interface and MQTT source

Nothing is wired up yet.`,
              author: "sol",
              daysAgo: 2,
              changes: {
                "internal/ingest/source.go": sourceGo,
                "internal/ingest/mqtt.go": mqttGo,
              },
            },
          ],
          comments: [
            {
              author: "kofi",
              body: "Before we take on an MQTT dependency: could the south reef gateway POST feed lines to tidepool instead? An ingest endpoint would cover them and anything else that wants to push.",
              hoursAfter: 9,
            },
            {
              author: "sol",
              body: "Possibly. The gateway firmware can do HTTP, but only with fixed retries and no batching, so a flaky uplink means lots of tiny requests. I'll ask the reef team whether they can live with that before going further here.",
              hoursAfter: 13,
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
      at: "store-evict",
      title: "tidepool 0.1.0",
      notes: `First tagged release.

- Missing readings (\`MM\`) are accepted and reported as \`null\`
- \`since\` parameter on \`/stations/{id}/observations\`
- Station IDs are case-insensitive
- Readings older than 72h are no longer returned

**Breaking:** observation fields in the JSON response are now snake_case.`,
      author: "kofi",
      daysAgo: 218,
      artifacts: [
        { name: "tidepool_0.1.0_linux_amd64.tar.gz", sizeBytes: 3_412_877 },
        { name: "tidepool_0.1.0_linux_arm64.tar.gz", sizeBytes: 3_158_204 },
        { name: "tidepool_0.1.0_darwin_arm64.tar.gz", sizeBytes: 3_289_551 },
      ],
    },
    {
      tag: "v0.2.0",
      at: "readme-v02",
      title: "tidepool 0.2.0",
      notes: `- Gzip-compressed responses when the client accepts them (thanks @tomas)
- \`/healthz\` endpoint for liveness probes
- Timestamps without seconds are accepted (thanks @yuki)
- Relays time out after 20s and back off when they keep failing
- New \`-retention\` flag (default 72h)
- Requires Go 1.23 to build

Binaries for Linux and macOS on amd64 and arm64 are attached.`,
      author: "kofi",
      daysAgo: 44,
      artifacts: [
        { name: "tidepool_0.2.0_linux_amd64.tar.gz", sizeBytes: 3_587_120 },
        { name: "tidepool_0.2.0_linux_arm64.tar.gz", sizeBytes: 3_301_946 },
        { name: "tidepool_0.2.0_darwin_amd64.tar.gz", sizeBytes: 3_524_388 },
        { name: "tidepool_0.2.0_darwin_arm64.tar.gz", sizeBytes: 3_430_012 },
        { name: "SHA256SUMS", sizeBytes: 412 },
      ],
    },
  ],
};
