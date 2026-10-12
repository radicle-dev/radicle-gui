use std::collections::BTreeMap;

use base64::Engine;
use radicle_surf as surf;
use serde::{Deserialize, Serialize};

use radicle::identity::{Doc, DocAt, doc};
use radicle::issue::cache::Issues as _;
use radicle::node::AliasStore;
use radicle::node::routing::Store;
use radicle::patch::cache::Patches as _;
use radicle::storage;
use radicle::storage::{ReadRepository, ReadStorage, RepositoryInfo, WriteStorage};
use radicle::{git, identity, node};

use crate::cobs;
use crate::diff;
use crate::diff::Diff;
use crate::error::Error;
use crate::repo;
use crate::source;
use crate::traits::Profile;

const COMMIT_PREFIX_LIMIT: usize = 10;

pub const MAX_BLOB_SIZE: usize = 10_485_760;

#[derive(Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Show {
    Delegate,
    All,
    Contributor,
    Seeded,
    Private,
}

/// A repo counts as one the local node contributes to whenever it has
/// local signed refs, even if those refs are at an outdated feature
/// level pending node-side migration.
fn is_contributor(refs: &storage::SignedRefsInfo) -> bool {
    matches!(
        refs,
        storage::SignedRefsInfo::Some(_) | storage::SignedRefsInfo::NeedsMigration,
    )
}

/// Resolve a `(peer, revision)` pair to a commit OID. A named revision is
/// looked up under the peer's namespaced `refs/heads` and `refs/tags` when a
/// peer is given, otherwise under the canonical top-level refs. With no
/// revision, a peer resolves to its head of the project's default branch, and
/// no peer resolves to the canonical head. A full commit OID resolves to itself,
/// unless it is Radicle's own bookkeeping rather than a commit of the project.
fn resolve_revision(
    repo: &storage::git::Repository,
    peer: Option<node::NodeId>,
    revision: Option<String>,
) -> Result<git::Oid, Error> {
    let lookup = |refname: String| -> Option<git::Oid> {
        let r = repo.backend.find_reference(&refname).ok()?;
        let commit = r.peel_to_commit().ok()?;
        Some(commit.id().into())
    };

    if let Some(oid) = revision
        .as_deref()
        .filter(|name| name.len() == 40)
        .and_then(|name| name.parse::<git::Oid>().ok())
        .filter(|oid| repo.backend.find_commit((*oid).into()).is_ok())
        .filter(|oid| !is_radicle_metadata(&repo.backend, *oid))
    {
        return Ok(oid);
    }

    match peer {
        Some(peer) => {
            let name = match revision {
                Some(rev) => rev,
                None => {
                    let DocAt { doc, .. } = repo.identity_doc()?;
                    doc.project()
                        .map_err(|e| Error::RevisionNotFound(e.to_string()))?
                        .default_branch()
                        .to_string()
                }
            };
            ["refs/heads", "refs/tags"]
                .iter()
                .find_map(|prefix| lookup(format!("refs/namespaces/{peer}/{prefix}/{name}")))
                .ok_or_else(|| Error::RevisionNotFound(format!("{name} under peer {peer}")))
        }
        None => match revision {
            Some(name) => ["refs/heads", "refs/tags"]
                .iter()
                .find_map(|prefix| lookup(format!("{prefix}/{name}")))
                .ok_or(Error::RevisionNotFound(name)),
            None => {
                let (_, head) = repo.head()?;
                Ok(head)
            }
        },
    }
}

/// Tally `git diff --numstat` between two commits into diff stats. Returns
/// `None` if git is unavailable or its output can't be parsed, so the caller
/// can fall back to the (slower) radicle-surf diff.
fn numstat(repo_dir: &std::path::Path, base: git::Oid, head: git::Oid) -> Option<diff::Stats> {
    let mut command = crate::binaries::git_command()?;
    command
        .current_dir(repo_dir)
        // Porcelain `git diff` honours user configuration (diff.renames,
        // diff.algorithm, external diff drivers, …), which would make the
        // reported stats machine-dependent and diverge from the surf
        // fallback. Pointing both config scopes at /dev/null pins the
        // output to git's defaults.
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .arg("diff")
        .arg("--numstat")
        .arg(base.to_string())
        .arg(head.to_string());

    let output = command
        .output()
        .ok()
        .filter(|output| output.status.success())?;

    let mut stats = diff::Stats {
        files_changed: 0,
        insertions: 0,
        deletions: 0,
    };
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        // Each line is "<added>\t<deleted>\t<path>"; binary files report "-".
        let mut cols = line.split('\t');
        let added = cols.next()?;
        let deleted = cols.next()?;
        if cols.next().is_none() {
            continue;
        }
        stats.files_changed += 1;
        stats.insertions += added.parse::<usize>().unwrap_or(0);
        stats.deletions += deleted.parse::<usize>().unwrap_or(0);
    }
    Some(stats)
}

/// Resolve the most recent commit that modified `path`, reachable from `head`.
///
/// Fast path: `git rev-list` walks the history using the commit-graph (when
/// present), skipping the per-commit tree diff that libgit2 performs for a
/// pathspec walk. On large histories (e.g. the Linux kernel) the libgit2 walk
/// is seconds-to-minutes for a file last touched long ago, while this is
/// near-instant. Not a verification step: trust comes from the signed tip and
/// git's content-addressed DAG; the commit-graph is a local derived index over
/// those same objects. Falls back to the libgit2 walk if git is unavailable.
fn last_path_commit(
    surf_repo: &surf::Repository,
    repo_path: &std::path::Path,
    head: git::Oid,
    path: &std::path::Path,
) -> Result<repo::Commit, Error> {
    let fast = crate::binaries::git_command().and_then(|mut command| {
        command
            .current_dir(repo_path)
            .arg("rev-list")
            .arg("-1")
            .arg(head.to_string())
            .arg("--")
            // `:(literal)` disables pathspec glob matching so file names
            // containing `[`, `*` or `?` (e.g. `src/pages/[id].ts`) are looked
            // up verbatim instead of being treated as wildcard patterns.
            .arg(format!(":(literal){}", path.display()));

        command
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| {
                String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .parse::<git::Oid>()
                    .ok()
            })
    });

    let commit = match fast {
        Some(oid) => surf_repo.commit(oid)?,
        None => surf_repo
            .last_commit(&path, head)?
            .ok_or_else(|| git2::Error::from_str("no commit found for path"))?,
    };

    Ok(commit.into())
}

/// The `git2::Diff` between `base` and `head` with the app's canonical
/// options (patience, minimal, exact-match rename detection). With `base`
/// unset the diff is taken against `head`'s first parent, or the empty tree
/// for a root commit. `show_binary` additionally embeds full binary deltas
/// so serialized patch text stays `git apply`-able.
fn tree_diff<'a>(
    repo: &'a git2::Repository,
    base: Option<git::Oid>,
    head: git::Oid,
    unified: u32,
    show_binary: bool,
) -> Result<git2::Diff<'a>, Error> {
    let head = repo.find_commit(head.into())?;
    let left = match base {
        Some(base) => Some(repo.find_commit(base.into())?.tree()?),
        None => head
            .parents()
            .next()
            .map(|parent| parent.tree())
            .transpose()?,
    };
    let right = head.tree()?;

    let mut opts = git::raw::DiffOptions::new();
    opts.patience(true)
        .minimal(true)
        .context_lines(unified)
        .show_binary(show_binary);

    let mut find_opts = git::raw::DiffFindOptions::new();
    find_opts.exact_match_only(true);
    find_opts.all(true);

    let mut diff = repo.diff_tree_to_tree(left.as_ref(), Some(&right), Some(&mut opts))?;
    diff.find_similar(Some(&mut find_opts))?;

    Ok(diff)
}

/// Collect canonical branches and tags as declared by the repository's
/// identity document. The canonical-refs rules (the `xyz.radicle.crefs`
/// payload, or a synthesized default covering the project's default branch)
/// define which ref patterns are canonical; each pattern is globbed against
/// the storage repo's resolved top-level refs (per-peer refs live under
/// `refs/namespaces/`). Only refs under `refs/heads` and `refs/tags` are
/// kept, and refs that cannot be peeled to a commit are skipped.
fn canonical_refs(repo: &storage::git::Repository) -> Result<repo::Canonical, Error> {
    let mut canonical = repo::Canonical::default();

    let DocAt { doc, .. } = repo.identity_doc()?;
    let crefs = doc
        .canonical_refs()
        .map_err(storage::RepositoryError::from)?;
    let rules = git::canonical::rules::RawRules::from(crefs.rules().clone());

    for (pattern, _) in rules.iter() {
        for r in repo.backend.references_glob(pattern.as_str())? {
            let r = r?;
            let Ok(name) = r.name() else { continue };
            let Some(oid) = r.target() else { continue };

            if let Some(short) = name.strip_prefix("refs/tags/") {
                let Some(tag) = resolve_tag(repo, oid) else {
                    continue;
                };
                canonical.tags.insert(short.to_owned(), tag);
            } else if let Some(short) = name.strip_prefix("refs/heads/") {
                let Ok(commit) = repo
                    .backend
                    .find_object(oid, None)
                    .and_then(|obj| obj.peel_to_commit())
                else {
                    continue;
                };
                canonical
                    .branches
                    .insert(short.to_owned(), commit.id().into());
            }
        }
    }

    Ok(canonical)
}

/// Resolve a ref OID to a [`repo::Tag`]. For annotated tags uses tagger time;
/// for lightweight tags uses the target commit's time. Returns `None` if the
/// OID cannot be peeled to a commit.
fn resolve_tag(repo: &storage::git::Repository, oid: git::raw::Oid) -> Option<repo::Tag> {
    if let Ok(tag) = repo.backend.find_tag(oid) {
        let target_oid = tag.target_id();
        let commit = repo.backend.find_commit(target_oid).ok()?;
        let tagger = tag.tagger().map(|t| repo::Tagger {
            name: t.name().unwrap_or_default().to_owned(),
            email: t.email().unwrap_or_default().to_owned(),
            timestamp: t.when().seconds(),
        });
        let timestamp = tagger
            .as_ref()
            .map(|t| t.timestamp)
            .unwrap_or_else(|| commit.time().seconds());
        return Some(repo::Tag {
            oid: commit.id().into(),
            tag_oid: Some(oid.into()),
            timestamp,
            tagger,
            message: tag.message().ok().flatten().map(str::to_owned),
        });
    }
    let commit = repo.backend.find_commit(oid).ok()?;
    Some(repo::Tag {
        oid: commit.id().into(),
        tag_oid: None,
        timestamp: commit.time().seconds(),
        tagger: None,
        message: None,
    })
}

/// Partition a remote's refs into short-name branch and tag maps. Refs that
/// cannot be peeled to a commit, are not qualified, or are not under
/// `refs/heads` or `refs/tags` are skipped.
fn partition_refs(
    refs: &storage::refs::Refs,
    repo: &storage::git::Repository,
) -> (BTreeMap<String, git::Oid>, BTreeMap<String, repo::Tag>) {
    let mut branches = BTreeMap::new();
    let mut tags = BTreeMap::new();

    for (refname, oid) in refs.iter() {
        let Some(qualified) = refname.qualified() else {
            continue;
        };

        let (_, category, first, rest) = qualified.non_empty_components();
        let name = std::iter::once(first)
            .chain(rest)
            .collect::<git::fmt::RefString>()
            .to_string();

        match category.as_str() {
            "heads" => {
                let Ok(commit) = repo
                    .backend
                    .find_object((*oid).into(), None)
                    .and_then(|obj| obj.peel_to_commit())
                else {
                    continue;
                };
                branches.insert(name, commit.id().into());
            }
            "tags" => {
                let Some(tag) = resolve_tag(repo, (*oid).into()) else {
                    continue;
                };
                tags.insert(name, tag);
            }
            _ => {}
        }
    }

    (branches, tags)
}

pub trait Repo: Profile {
    fn list_repos(&self, show: Show) -> Result<Vec<repo::RepoInfo>, Error> {
        let profile = self.profile();
        let storage = &profile.storage;
        let policies = profile.policies()?;
        let repos = storage.repositories()?;
        let mut entries = Vec::new();

        for RepositoryInfo { rid, doc, refs, .. } in repos {
            if !is_contributor(&refs) && show == Show::Contributor {
                continue;
            }

            if !policies.is_seeding(&rid)? && show == Show::Seeded {
                continue;
            }

            if !doc.is_private() && show == Show::Private {
                continue;
            }

            if !doc.delegates().contains(&profile.public_key.into()) && show == Show::Delegate {
                continue;
            }

            let repo = profile.storage.repository(rid)?;
            let repo_info = self.repo_info(&repo, &doc)?;

            entries.push(repo_info)
        }

        entries.sort_by_key(|repo_info| {
            repo_info
                .payloads
                .project
                .as_ref()
                .map(|p| p.name().to_lowercase())
        });

        Ok::<_, Error>(entries)
    }

    fn list_repos_summary(&self, show: Show) -> Result<Vec<repo::RepoSummary>, Error> {
        let profile = self.profile();
        let storage = &profile.storage;
        let policies = profile.policies()?;
        let repos = storage.repositories()?;
        let mut entries = Vec::new();

        for RepositoryInfo { rid, doc, .. } in repos {
            let seeding = policies.is_seeding(&rid)?;

            if !seeding && show == Show::Seeded {
                continue;
            }

            let Some(data) = doc
                .payload()
                .get(&doc::PayloadId::project())
                .and_then(|payload| repo::ProjectPayloadData::try_from((*payload).clone()).ok())
            else {
                continue;
            };
            entries.push(repo::RepoSummary {
                rid,
                name: data.name,
                private: doc.is_private(),
                seeding,
            });
        }

        entries.sort_by_key(|r| r.name.to_lowercase());

        Ok::<_, Error>(entries)
    }

    fn repo_count(&self) -> Result<repo::RepoCount, Error> {
        let profile = self.profile();
        let storage = &profile.storage;
        let policies = profile.policies()?;
        let repos = storage.repositories()?;
        let mut total = 0;
        let mut delegate = 0;
        let mut private = 0;
        let mut contributor = 0;
        let mut seeding = 0;

        for RepositoryInfo { rid, doc, refs, .. } in repos {
            total += 1;
            if policies.is_seeding(&rid)? {
                seeding += 1;
            }

            if doc.is_private() {
                private += 1;
            }

            if doc.delegates().contains(&profile.public_key.into()) {
                delegate += 1;
            }

            if is_contributor(&refs) {
                contributor += 1;
            }
        }

        Ok::<_, Error>(repo::RepoCount {
            total,
            contributor,
            seeding,
            private,
            delegate,
        })
    }

    fn repo_readme(
        &self,
        rid: identity::RepoId,
        sha: Option<git::Oid>,
        peer: Option<node::NodeId>,
        revision: Option<String>,
    ) -> Result<Option<repo::Readme>, Error> {
        let profile = self.profile();
        let storage_repo = profile.storage.repository(rid)?;
        let repo_path = storage::git::paths::repository(&profile.storage, &rid);
        let surf_repo = radicle_surf::Repository::open(&repo_path)?;

        let paths = [
            "README",
            "README.md",
            "README.markdown",
            "README.adoc",
            "README.asciidoc",
            "README.txt",
            "README.rst",
            "README.org",
            "Readme.md",
        ];

        let oid = match sha {
            Some(sha) => sha,
            None => resolve_revision(&storage_repo, peer, revision)?,
        };
        let tree = storage_repo.backend.find_commit(oid.into())?.tree()?;

        for path in paths
            .iter()
            .map(ToString::to_string)
            .chain(paths.iter().map(|p| p.to_lowercase()))
        {
            let Ok(entry) = tree.get_path(std::path::Path::new(&path)) else {
                continue;
            };
            let Ok(blob) = entry
                .to_object(&storage_repo.backend)
                .and_then(|object| object.peel_to_blob())
            else {
                continue;
            };

            if blob.size() > MAX_BLOB_SIZE {
                return Err(Error::FileTooLarge(blob.size()));
            }

            let content = match std::str::from_utf8(blob.content()) {
                Ok(s) => s.to_owned(),
                Err(_) => base64::engine::general_purpose::STANDARD.encode(blob.content()),
            };
            // A failed last-commit lookup skips this candidate instead of
            // failing the whole call, so the repo home still renders (at
            // worst without a README), matching the pre-rewrite behaviour.
            let Ok(last_commit) =
                last_path_commit(&surf_repo, &repo_path, oid, std::path::Path::new(&path))
            else {
                continue;
            };

            return Ok(Some(repo::Readme {
                id: radicle_surf::Oid::from(blob.id()),
                commit: last_commit,
                mime_type: "text/plain".to_owned(),
                path,
                content,
                binary: blob.is_binary(),
            }));
        }
        Ok(None)
    }

    fn repo_tree(
        &self,
        rid: identity::RepoId,
        path: std::path::PathBuf,
        sha: Option<git::Oid>,
        peer: Option<node::NodeId>,
        revision: Option<String>,
    ) -> Result<source::tree::Tree, Error> {
        let profile = self.profile();
        let storage_repo = profile.storage.repository(rid)?;
        let repo = radicle_surf::Repository::open(radicle::storage::git::paths::repository(
            &profile.storage,
            &rid,
        ))?;
        let oid = match sha {
            Some(sha) => sha,
            None => resolve_revision(&storage_repo, peer, revision)?,
        };
        let tree = repo.tree(oid, &path)?;
        Ok(source::tree::Tree::from_surf(tree, &path))
    }

    fn repo_blob(
        &self,
        rid: identity::RepoId,
        path: std::path::PathBuf,
        sha: Option<git::Oid>,
    ) -> Result<source::blob::Blob, Error> {
        let profile = self.profile();
        let storage_repo = profile.storage.repository(rid)?;
        let repo_path = storage::git::paths::repository(&profile.storage, &rid);
        let surf_repo = radicle_surf::Repository::open(&repo_path)?;

        let oid = match sha {
            Some(sha) => sha,
            None => surf_repo.head()?,
        };

        // Resolve the blob via a direct tree lookup. `surf::Repository::blob`
        // additionally walks history to find the last commit that touched the
        // path, which we do separately (and cheaply) below.
        let commit = storage_repo.backend.find_commit(oid.into())?;
        let entry = commit.tree()?.get_path(&path)?;
        let blob = entry
            .to_object(&storage_repo.backend)?
            .into_blob()
            .map_err(|_| git2::Error::from_str("path does not point to a blob"))?;

        let last_commit = last_path_commit(&surf_repo, &repo_path, oid, &path)?;

        Ok(source::blob::Blob::new(
            blob.id().into(),
            blob.is_binary(),
            last_commit,
            blob.content(),
        ))
    }

    /// The bytes of the file at `path`, for files the webview renders itself,
    /// like the images in a README. Unlike `repo_blob` it skips the last
    /// commit lookup and the text encoding.
    fn repo_blob_bytes(
        &self,
        rid: identity::RepoId,
        path: std::path::PathBuf,
        sha: git::Oid,
    ) -> Result<Vec<u8>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let commit = repo.backend.find_commit(sha.into())?;
        let entry = commit.tree()?.get_path(&path)?;
        let blob = entry
            .to_object(&repo.backend)?
            .into_blob()
            .map_err(|_| git2::Error::from_str("path does not point to a blob"))?;

        if blob.size() > MAX_BLOB_SIZE {
            return Err(Error::FileTooLarge(blob.size()));
        }

        Ok(blob.content().to_vec())
    }

    fn list_repo_refs(&self, rid: identity::RepoId) -> Result<repo::RepoRefs, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let DocAt { doc, .. } = repo.identity_doc()?;
        let delegates = doc.delegates();
        let aliases = profile.aliases();

        let mut remotes = Vec::new();
        for entry in repo.remotes()? {
            let (id, remote) = entry?;
            let (branches, tags) = partition_refs(&remote.refs, &repo);
            remotes.push(repo::Remote {
                id,
                alias: aliases.alias(&id),
                delegate: delegates.contains(&id.into()),
                branches,
                tags,
            });
        }

        let canonical = canonical_refs(&repo).unwrap_or_default();

        Ok(repo::RepoRefs { canonical, remotes })
    }

    /// The canonical tags, without the per-peer refs that `list_repo_refs`
    /// loads and verifies for every remote.
    fn list_canonical_tags(
        &self,
        rid: identity::RepoId,
    ) -> Result<BTreeMap<String, repo::Tag>, Error> {
        let repo = self.profile().storage.repository(rid)?;

        Ok(canonical_refs(&repo)?.tags)
    }

    fn repo_by_id(&self, rid: identity::RepoId) -> Result<repo::RepoInfo, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let DocAt { doc, .. } = repo.identity_doc()?;

        let repo_info = self.repo_info(&repo, &doc)?;

        Ok::<_, Error>(repo_info)
    }

    fn diff_stats(
        &self,
        rid: identity::RepoId,
        base: git::Oid,
        head: git::Oid,
    ) -> Result<diff::Stats, Error> {
        let profile = self.profile();

        // Fast path: `git diff --numstat` opens the repo and tallies per-file
        // line counts far faster than radicle-surf's full-content diff. List
        // views request stats for every patch row, and each surf diff re-opens
        // the whole repo (seconds in aggregate on a large repo). Falls back to
        // the surf diff if the git binary is unavailable or output can't parse.
        let repo_path = storage::git::paths::repository(&profile.storage, &rid);
        if let Some(stats) = numstat(&repo_path, base, head) {
            return Ok(stats);
        }

        let repo = radicle_surf::Repository::open(&repo_path)?;
        let base = repo.commit(base)?;
        let commit = repo.commit(head)?;
        let diff = repo.diff(base.id, commit.id)?;
        let stats = diff.stats();

        Ok::<_, Error>(diff::Stats::new(stats))
    }

    fn repo_info(
        &self,
        repo: &storage::git::Repository,
        doc: &Doc,
    ) -> Result<repo::RepoInfo, Error> {
        let profile = self.profile();
        let aliases = profile.aliases();
        let delegates = doc
            .delegates()
            .iter()
            .map(|did| cobs::Author::new(did, &aliases))
            .collect::<Vec<_>>();
        let db = profile.database()?;
        let seeding = db.count(&repo.id).unwrap_or_default();
        let seeded = profile.policies()?.is_seeding(&repo.id)?;
        let (_, head) = repo.head()?;
        let commit = repo.commit(head)?;
        let project = doc
            .payload()
            .get(&doc::PayloadId::project())
            .and_then(|payload| {
                let patches = profile.patches(repo).ok()?;
                let patches = patches.counts().ok()?;
                let issues = profile.issues(repo).ok()?;
                let issues = issues.counts().ok()?;

                let data: repo::ProjectPayloadData = (*payload).clone().try_into().ok()?;
                let meta = repo::ProjectPayloadMeta {
                    issues,
                    patches,
                    head,
                };

                Some(repo::ProjectPayload::new(data, meta))
            });

        Ok::<_, Error>(repo::RepoInfo {
            payloads: repo::SupportedPayloads { project },
            delegates,
            threshold: doc.threshold(),
            visibility: repo::Visibility::new(doc.visibility(), &aliases),
            rid: repo.id,
            seeding,
            seeded,
            last_commit_timestamp: commit.time().seconds() * 1000,
        })
    }

    /// A manifest of the files a diff touches and their stats — not the lines,
    /// which the app gets from `get_diff_text`. Nothing here depends on how much
    /// context a hunk carries, so the diff is taken with none: it is thrown away
    /// either way, and computing it is work.
    fn get_diff(
        &self,
        rid: identity::RepoId,
        options: cobs::diff::DiffOptions,
    ) -> Result<Diff, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?.backend;
        let diff = tree_diff(&repo, Some(options.base), options.head, 0, false)?;
        let diff = surf::diff::Diff::try_from(diff)?;

        Ok::<_, Error>(diff.into())
    }

    /// As `get_diff`, for a commit against its first parent.
    fn get_commit_diff(&self, rid: identity::RepoId, sha: git::Oid) -> Result<Diff, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?.backend;
        let diff = tree_diff(&repo, None, sha, 0, false)?;
        let diff = surf::diff::Diff::try_from(diff)?;

        Ok::<_, Error>(diff.into())
    }

    /// Serialize a diff as `git diff`-format patch text via libgit2, built
    /// with the same options as `get_diff`/`get_commit_diff` so the text
    /// matches the rendered diff. When `base` is unset the diff is taken
    /// against `head`'s first parent (or the empty tree for a root commit),
    /// mirroring `get_commit_diff`. When `path` is set, output is limited to
    /// that file's delta (matching either side of a rename).
    fn get_diff_text(
        &self,
        rid: identity::RepoId,
        base: Option<git::Oid>,
        head: git::Oid,
        unified: Option<u32>,
        path: Option<String>,
    ) -> Result<String, Error> {
        let unified = unified.unwrap_or(5);
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?.backend;
        let diff = tree_diff(&repo, base, head, unified, true)?;

        let path = path.map(std::path::PathBuf::from);
        let mut buf = Vec::new();
        diff.print(git2::DiffFormat::Patch, |delta, _hunk, line| {
            if let Some(path) = path.as_deref()
                && delta.new_file().path() != Some(path)
                && delta.old_file().path() != Some(path)
            {
                return true;
            }
            // Content lines carry their origin marker ('+', '-', ' ')
            // separately from the text; header and EOF-marker lines already
            // include their full text.
            match line.origin() {
                '+' | '-' | ' ' => buf.push(line.origin() as u8),
                _ => {}
            }
            buf.extend_from_slice(line.content());
            true
        })?;

        Ok(String::from_utf8_lossy(&buf).into_owned())
    }

    fn list_commits(
        &self,
        rid: identity::RepoId,
        base: String,
        head: String,
    ) -> Result<Vec<repo::Commit>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;

        // Hide `base` from the walk rather than stopping at the first commit
        // that equals it. A merge commit reaches `base` through one of its
        // parents, so truncating there drops every commit the other parent
        // contributes and leaves the revision looking like a single commit.
        let mut walk = repo.backend.revwalk()?;
        walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
        walk.push(git::raw::Oid::from_str(&head)?)?;
        walk.hide(git::raw::Oid::from_str(&base)?)?;

        let surf_repo = surf::Repository::open(repo.path())?;
        let commits = walk
            .filter_map(|oid| oid.ok())
            .filter_map(|oid| surf_repo.commit(git::Oid::from(oid)).ok())
            .map(Into::into)
            .collect();

        Ok(commits)
    }

    fn list_repo_commits(
        &self,
        rid: identity::RepoId,
        head: Option<git::Oid>,
        peer: Option<node::NodeId>,
        revision: Option<String>,
        skip: Option<usize>,
        take: Option<usize>,
    ) -> Result<crate::cobs::PaginatedQuery<Vec<repo::Commit>>, Error> {
        let profile = self.profile();
        let storage_repo = profile.storage.repository(rid)?;

        let oid = match head {
            Some(head) => head,
            None => resolve_revision(&storage_repo, peer, revision)?,
        };

        let repo = surf::Repository::open(storage_repo.path())?;
        let commits = repo.history(oid)?;
        let cursor = skip.unwrap_or(0);

        match take {
            None => {
                let content: Vec<repo::Commit> =
                    commits.filter_map(|c| c.map(Into::into).ok()).collect();

                Ok(crate::cobs::PaginatedQuery {
                    cursor: 0,
                    more: false,
                    content,
                })
            }
            Some(take) => {
                let content: Vec<repo::Commit> = commits
                    .filter_map(|c| c.map(Into::into).ok())
                    .skip(cursor)
                    .take(take + 1)
                    .collect();
                let more = content.len() > take;
                let content = if more {
                    content[..take].to_vec()
                } else {
                    content
                };

                Ok(crate::cobs::PaginatedQuery {
                    cursor,
                    more,
                    content,
                })
            }
        }
    }

    fn repo_commit_count(&self, rid: identity::RepoId, head: git::Oid) -> Result<usize, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;

        // Fast path: `git rev-list --count` uses the pack bitmap / commit-graph
        // (when present) for a near-instant count, whereas libgit2's revwalk
        // ignores those indexes and walks every commit (seconds on large
        // histories). Not a verification step: trust comes from the signed
        // `head` tip and git's content-addressed DAG keeps ancestry
        // tamper-evident; the bitmap/commit-graph are local derived indexes
        // over those same objects, not a new trust input. Falls back to the
        // walk below if the git binary is unavailable or errors.
        let count = crate::binaries::git_command().and_then(|mut command| {
            command.current_dir(repo.backend.path()).args([
                "rev-list",
                "--count",
                "--use-bitmap-index",
                &head.to_string(),
            ]);

            command
                .output()
                .ok()
                .filter(|output| output.status.success())
                .and_then(|output| {
                    String::from_utf8_lossy(&output.stdout)
                        .trim()
                        .parse::<usize>()
                        .ok()
                })
        });
        if let Some(count) = count {
            return Ok(count);
        }

        // Fallback: unsorted libgit2 walk (no Commit materialization, no
        // ordering — counting only needs the reachable OIDs).
        let mut revwalk = repo.backend.revwalk()?;
        revwalk.set_sorting(git2::Sort::NONE)?;
        revwalk.push(head.into())?;

        Ok(revwalk.count())
    }

    fn repo_commit(
        &self,
        rid: identity::RepoId,
        sha: Option<git::Oid>,
        peer: Option<node::NodeId>,
        revision: Option<String>,
    ) -> Result<repo::Commit, Error> {
        let profile = self.profile();
        let storage_repo = profile.storage.repository(rid)?;

        let oid = match sha {
            Some(sha) if is_radicle_metadata(&storage_repo.backend, sha) => {
                return Err(Error::RevisionNotFound(sha.to_string()));
            }
            Some(sha) => sha,
            None => resolve_revision(&storage_repo, peer, revision)?,
        };

        let repo = surf::Repository::open(storage_repo.path())?;
        let commit = repo.commit(oid)?;

        Ok(commit.into())
    }

    fn repo_commits_by_prefix(
        &self,
        rid: identity::RepoId,
        prefix: String,
    ) -> Result<Vec<repo::Commit>, Error> {
        if !(4..=40).contains(&prefix.len()) || !prefix.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Ok(Vec::new());
        }

        let profile = self.profile();
        let storage_repo = profile.storage.repository(rid)?;

        // `git rev-parse --disambiguate` lists every object with the prefix,
        // which libgit2 cannot do: it only resolves a unique prefix. Falls back
        // to that when the git binary is unavailable.
        let oids = crate::binaries::git_command()
            .and_then(|mut command| {
                // An explicit `--git-dir` wins over a `GIT_DIR` the app may
                // have inherited, which would otherwise pick the repository.
                let mut git_dir = std::ffi::OsString::from("--git-dir=");
                git_dir.push(storage_repo.path());
                command
                    .arg(git_dir)
                    .arg("rev-parse")
                    .arg(format!("--disambiguate={prefix}"));

                command
                    .output()
                    .ok()
                    .filter(|output| output.status.success())
                    .map(|output| {
                        String::from_utf8_lossy(&output.stdout)
                            .lines()
                            .filter_map(|line| line.trim().parse::<git::Oid>().ok())
                            .collect::<Vec<_>>()
                    })
            })
            .unwrap_or_else(|| {
                storage_repo
                    .backend
                    .find_commit_by_prefix(&prefix)
                    .map(|commit| vec![commit.id().into()])
                    .unwrap_or_default()
            });

        let repo = surf::Repository::open(storage_repo.path())?;

        Ok(oids
            .into_iter()
            .filter(|oid| !is_radicle_metadata(&storage_repo.backend, *oid))
            .filter_map(|oid| repo.commit(oid).ok())
            .take(COMMIT_PREFIX_LIMIT)
            .map(Into::into)
            .collect())
    }

    fn repo_split_tree_path(
        &self,
        rid: identity::RepoId,
        peer: Option<node::NodeId>,
        path: String,
    ) -> Result<repo::TreePath, Error> {
        let profile = self.profile();
        let storage_repo = profile.storage.repository(rid)?;
        let segments = path
            .split('/')
            .filter(|segment| !segment.is_empty())
            .collect::<Vec<_>>();

        for end in (1..=segments.len()).rev() {
            let revision = segments[..end].join("/");
            if resolve_revision(&storage_repo, peer, Some(revision.clone())).is_ok() {
                return Ok(repo::TreePath {
                    revision,
                    path: segments[end..].join("/"),
                });
            }
        }

        let DocAt { doc, .. } = storage_repo.identity_doc()?;
        let revision = doc
            .project()
            .map_err(|e| Error::RevisionNotFound(e.to_string()))?
            .default_branch()
            .to_string();

        Ok(repo::TreePath {
            revision,
            path: segments.join("/"),
        })
    }

    fn unseed(&self, rid: identity::RepoId) -> Result<(), Error> {
        let profile = self.profile();
        let mut node = radicle::Node::new(profile.home().socket_from_env());

        profile.unseed(rid, &mut node)?;

        // Unseeding deletes the repository's policy row, so a node whose
        // default seeding policy is `allow` carries on seeding it. Saying so is
        // better than reporting success and leaving the repo where it was.
        if profile.policies()?.is_seeding(&rid)? {
            return Err(Error::DefaultPolicySeeds);
        }

        Ok(())
    }

    /// Remove the repository's remotes from storage, mirroring `rad clean`.
    ///
    /// If the local node has never written signed refs for this repository,
    /// storage drops it entirely. Otherwise only the remotes that are neither
    /// the local node's nor a delegate's are removed, and the repository stays
    /// on disk.
    fn clean(&self, rid: identity::RepoId) -> Result<(), Error> {
        let profile = self.profile();

        profile.storage.clean(rid)?;

        Ok(())
    }

    fn seed(&self, rid: identity::RepoId) -> Result<(), Error> {
        let profile = self.profile();
        let mut node = radicle::Node::new(profile.home().socket_from_env());

        profile.seed(rid, node::policy::Scope::All, &mut node)?;

        // The policy alone only fetches once a seed next announces the repo,
        // which a quiet one may not do for a long time. Fetch now, like
        // `rad seed`, without holding up the caller.
        let local = profile.public_key;
        let preferred = profile.config.preferred_seeds.clone();
        std::thread::spawn(move || fetch_from_seeds(node, rid, local, preferred));

        Ok(())
    }

    fn seeded_not_replicated(&self) -> Result<Vec<identity::RepoId>, Error> {
        let profile = &self.profile();
        let storage = &profile.storage;
        let policies = profile.policies()?;
        let entries = policies
            .seed_policies()?
            .filter_map(Result::ok)
            .filter(|policy| !storage.contains(&policy.rid).unwrap_or(false))
            .map(|policy| policy.rid)
            .collect::<Vec<_>>();

        Ok(entries)
    }
}

const SEED_FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(9);

// Fetches `rid` from the first seed that has it, connecting to it if needed.
fn fetch_from_seeds(
    mut node: radicle::Node,
    rid: identity::RepoId,
    local: radicle::crypto::PublicKey,
    preferred: Vec<node::config::ConnectAddress>,
) {
    use radicle::node::Handle as _;

    if !node.is_running() {
        return;
    }
    let (connected, disconnected) = match node.seeds_for(rid, [local]) {
        Ok(seeds) => seeds.partition(),
        Err(err) => {
            log::warn!("Looking up seeds for {rid} failed: {err}");
            Default::default()
        }
    };
    let connected = connected
        .into_iter()
        .map(|seed| seed.nid)
        .collect::<Vec<_>>();
    let disconnected = disconnected
        .into_iter()
        .filter_map(|seed| Some((seed.nid, seed.addrs.into_iter().next()?.addr)))
        .collect();
    let candidates = seed_candidates(&connected, preferred, disconnected, local);

    for (nid, addr) in candidates {
        if let Some(addr) = addr
            && !connected.contains(&nid)
        {
            let opts = node::ConnectOptions {
                persistent: false,
                timeout: SEED_FETCH_TIMEOUT,
            };
            match node.connect(nid, addr, opts) {
                Ok(node::ConnectResult::Connected) => {}
                Ok(node::ConnectResult::Disconnected { reason }) => {
                    log::warn!("Connecting to {nid} failed: {reason}");
                    continue;
                }
                Err(err) => {
                    log::warn!("Connecting to {nid} failed: {err}");
                    continue;
                }
            }
        }
        match node.fetch(rid, nid, SEED_FETCH_TIMEOUT, None) {
            Ok(result) if result.is_success() => return,
            Ok(result) => log::warn!("Fetching {rid} from {nid} failed: {result:?}"),
            Err(err) => log::warn!("Fetching {rid} from {nid} failed: {err}"),
        }
    }
    log::warn!("No seed had {rid} to fetch");
}

// Connected seeds come first, as they answer fastest. A repo nobody has
// announced to us yet has no known seeds, so the preferred seeds are tried
// before the other known ones.
fn seed_candidates(
    connected: &[node::NodeId],
    preferred: Vec<node::config::ConnectAddress>,
    disconnected: Vec<(node::NodeId, node::Address)>,
    local: node::NodeId,
) -> Vec<(node::NodeId, Option<node::Address>)> {
    let mut seen = std::collections::BTreeSet::from([local]);
    connected
        .iter()
        .map(|nid| (*nid, None))
        .chain(preferred.into_iter().map(|seed| {
            let (nid, addr) = seed.into();
            (nid, Some(addr))
        }))
        .chain(
            disconnected
                .into_iter()
                .map(|(nid, addr)| (nid, Some(addr))),
        )
        .filter(|(nid, _)| seen.insert(*nid))
        .collect()
}

fn is_radicle_metadata(repo: &git2::Repository, oid: git::Oid) -> bool {
    repo.find_commit(oid.into())
        .and_then(|commit| commit.tree())
        .map(|tree| tree.get_name("manifest").is_some() || tree.get_name("signature").is_some())
        .unwrap_or(false)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use radicle::crypto::{Seed, SigningKey};
    use radicle::storage::{ReadRepository, ReadStorage};
    use radicle::test::fixtures;

    use crate::traits::repo::Repo;
    use crate::{AppState, test};

    #[test]
    fn seed_candidates_order() {
        use radicle::node::{Address, NodeId};

        let nid = |id: &str| id.parse::<NodeId>().unwrap();
        let addr = |host: &str| host.parse::<Address>().unwrap();
        let local = nid("z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi");
        let connected = nid("z6MkrLMMsiPWUcNPHcRajuMi9mDfYckSoJyPwwnknocNYPm7");
        let preferred = nid("z6MkvUJtYD9dHDJfpevWRT98mzDDpdAtmUjwyDSkyqksUr7C");
        let known = nid("z6Mkvky2mnSYCTUMKRdAUoZXBXLLKtnWEkWeYQcGjjnmobAU");

        let candidates = super::seed_candidates(
            &[connected],
            vec![
                (preferred, addr("preferred.example:8776")).into(),
                (connected, addr("connected.example:8776")).into(),
                (local, addr("local.example:8776")).into(),
            ],
            vec![
                (known, addr("known.example:8776")),
                (preferred, addr("other.example:8776")),
            ],
            local,
        );
        assert_eq!(
            candidates,
            vec![
                (connected, None),
                (preferred, Some(addr("preferred.example:8776"))),
                (known, Some(addr("known.example:8776"))),
            ]
        );
    }

    #[test]
    fn repo_commits_by_prefix() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("working"), &profile.storage, &signer).unwrap();
        let identity = profile
            .storage
            .repository(rid)
            .unwrap()
            .identity_head()
            .unwrap();
        let state = AppState { profile };
        let head = head.to_string();

        let found = state
            .repo_commits_by_prefix(rid, head[..7].to_string())
            .unwrap();
        assert_eq!(
            found
                .iter()
                .map(|commit| commit.id.to_string())
                .collect::<Vec<_>>(),
            vec![head.clone()]
        );
        assert_eq!(
            state
                .repo_commits_by_prefix(rid, head.to_uppercase())
                .unwrap()
                .len(),
            1
        );

        assert!(
            state
                .repo_commits_by_prefix(rid, identity.to_string()[..7].to_string())
                .unwrap()
                .is_empty()
        );
        assert!(
            state
                .repo_commits_by_prefix(rid, head[..3].to_string())
                .unwrap()
                .is_empty()
        );
        assert!(
            state
                .repo_commits_by_prefix(rid, format!("{}z", &head[..6]))
                .unwrap()
                .is_empty()
        );
        assert!(
            state
                .repo_commits_by_prefix(rid, format!("--{}", &head[..6]))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn canonical_tags_ignore_peer_tags() {
        use radicle::cob::Title;
        use radicle::identity::Identity;
        use radicle::identity::doc::PayloadId;
        use radicle::storage::{SignRepository, WriteRepository, WriteStorage};

        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("working"), &profile.storage, &signer).unwrap();

        {
            let repo = profile.storage.repository_mut(rid).unwrap();
            let mut identity = Identity::load_mut(&repo, &signer).unwrap();
            let mut doc = identity.doc().clone().edit();
            doc.payload.insert(
                PayloadId::canonical_refs(),
                serde_json::json!({
                    "rules": {
                        "refs/tags/*": { "allow": "delegates", "threshold": 1 },
                    },
                })
                .into(),
            );
            identity
                .update(
                    Title::new("Make tags canonical").unwrap(),
                    "",
                    &doc.verified().unwrap(),
                )
                .unwrap();
            repo.sign_refs(&signer).unwrap();
            repo.set_identity_head().unwrap();

            let other = repo.identity_head().unwrap().into();
            let peer = "z6MkrLMMsiPWUcNPHcRajuMi9mDfYckSoJyPwwnknocNYPm7";
            let peer_tags = format!("refs/namespaces/{peer}/refs/tags");
            for (name, oid) in [
                ("refs/tags/v1".to_owned(), head),
                (format!("{peer_tags}/v1"), other),
                (format!("{peer_tags}/v2"), head),
            ] {
                repo.backend.reference(&name, oid, false, "test").unwrap();
            }
        }

        let tags = AppState { profile }.list_canonical_tags(rid).unwrap();
        assert_eq!(tags.keys().collect::<Vec<_>>(), vec!["v1"]);
        assert_eq!(tags["v1"].oid, head);
    }

    #[test]
    fn repo_split_tree_path() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("working"), &profile.storage, &signer).unwrap();
        let backend = &profile.storage.repository(rid).unwrap().backend;
        for name in [
            "refs/heads/feature/x",
            "refs/tags/feature",
            "refs/tags/v1.0",
        ] {
            backend.reference(name, head, false, "test").unwrap();
        }
        let state = AppState { profile };
        let split = |path: &str| {
            let split = state
                .repo_split_tree_path(rid, None, path.to_string())
                .unwrap();
            (split.revision, split.path)
        };

        assert_eq!(
            split("feature/x/src/lib.rs"),
            ("feature/x".into(), "src/lib.rs".into())
        );
        assert_eq!(split("feature/y/src"), ("feature".into(), "y/src".into()));
        assert_eq!(split("v1.0/README"), ("v1.0".into(), "README".into()));
        assert_eq!(
            split("docs/guide.md"),
            ("master".into(), "docs/guide.md".into())
        );
        assert_eq!(split("master"), ("master".into(), "".into()));
    }

    #[test]
    fn repo_blob_bytes() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("working"), &profile.storage, &signer).unwrap();
        let backend = &profile.storage.repository(rid).unwrap().backend;

        let large = backend.blob(&vec![0; super::MAX_BLOB_SIZE + 1]).unwrap();
        let mut tree = backend.treebuilder(None).unwrap();
        tree.insert("large.png", large, 0o100644).unwrap();
        let tree = backend.find_tree(tree.write().unwrap()).unwrap();
        let author = git2::Signature::now("alice", "alice@example.com").unwrap();
        let large_commit = backend
            .commit(None, &author, &author, "Add a large file", &tree, &[])
            .unwrap();

        let state = AppState { profile };

        assert_eq!(
            state
                .repo_blob_bytes(rid, "README".into(), head.into())
                .unwrap(),
            b"Hello World!\n"
        );
        assert!(
            state
                .repo_blob_bytes(rid, "missing.png".into(), head.into())
                .is_err()
        );
        assert!(matches!(
            state.repo_blob_bytes(rid, "large.png".into(), large_commit.into()),
            Err(crate::error::Error::FileTooLarge(size)) if size == super::MAX_BLOB_SIZE + 1
        ));
    }

    #[test]
    fn repo_commit_accepts_an_oid_revision() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("working"), &profile.storage, &signer).unwrap();
        let state = AppState { profile };

        let commit = state
            .repo_commit(rid, None, None, Some(head.to_string()))
            .unwrap();
        assert_eq!(commit.id.to_string(), head.to_string());
        assert!(
            state
                .repo_commit(rid, None, None, Some("f".repeat(40)))
                .is_err()
        );
        let identity = state
            .profile
            .storage
            .repository(rid)
            .unwrap()
            .identity_head()
            .unwrap();
        assert!(
            state
                .repo_commit(rid, None, None, Some(identity.to_string()))
                .is_err()
        );
        assert!(state.repo_commit(rid, Some(identity), None, None).is_err());
        assert!(
            state
                .repo_commit(rid, Some(head.into()), None, None)
                .is_ok()
        );
    }
}
