use radicle::cob::identity::{self, ApplyError, Identity, IdentityMut};
use radicle::cob::{self, EntryId, Title};
use radicle::crypto::PublicKey;
use radicle::identity::{Did, Doc, RepoId};
use radicle::node::{AliasStore as _, Handle};
use radicle::profile::Signer;
use radicle::storage::git::Repository;
use radicle::storage::{
    ReadRepository, ReadStorage, RepositoryError, SignRepository, WriteRepository,
};
use radicle::{Node, git, node};

use crate::actor;
use crate::actor::{
    ActorInfo, ActorKey, ActorPayload, ActorProfile, ActorRevision, Enrollment, EnrollmentPreview,
    IdentityDocRevision, PROFILE_PATH, ResolvedActor,
};
use crate::cobs::CobOptions;
use crate::error::Error;
use crate::traits::repo::Repo;

/// The default branch a new actor repository gets; after that, the default
/// branch is whatever its identity document names.
const NEW_BRANCH: &str = "main";

pub trait Actor: Repo {
    /// The local actor, the one live individual actor that binds the local key.
    /// `None` if there is none, `Ambiguous` if there are several. Scans every
    /// repository.
    fn actor(&self) -> Result<Option<ActorInfo>, Error> {
        let profile = self.profile();
        let did = profile.did();
        let mut found = Vec::new();

        for (rid, doc) in repositories(&profile.storage)? {
            // Only a repository whose current document names the key has
            // its history walked.
            if !ActorPayload::of(&doc).is_some_and(|payload| payload.keys.contains_key(&did)) {
                continue;
            }
            // One repository that cannot be read must not hide the rest.
            let loaded = profile
                .storage
                .repository(rid)
                .map_err(Error::from)
                .and_then(|repo| Ok((actor::identity_history(&repo)?, repo)));
            let (history, repo) = match loaded {
                Ok(loaded) => loaded,
                Err(e) => {
                    log::warn!("Skipping {rid} while looking for the actor: {e}");
                    continue;
                }
            };
            let Some(resolved) = actor::resolve(rid, &history) else {
                continue;
            };
            if resolved.is_live_individual() && resolved.bound_keys().any(|bound| bound == did) {
                found.push((repo, history, resolved));
            }
        }

        match found.len() {
            0 => Ok(None),
            1 => {
                let (repo, history, resolved) = found.remove(0);
                Ok(Some(actor_info(self, &repo, &history, resolved)?))
            }
            _ => Err(
                actor::Error::Ambiguous(found.iter().map(|(repo, _, _)| repo.id).collect()).into(),
            ),
        }
    }

    /// The new actor for the local key, with `profile` as its first commit; a
    /// failure leaves nothing behind. `Exists` if the key has an actor, `Profile`
    /// if `profile` is invalid, `NameTaken` if the key had an actor of that name.
    /// Scans every repository.
    fn create_actor(&self, profile: ActorProfile, opts: CobOptions) -> Result<ActorInfo, Error> {
        let profile = profile.normalized();
        profile.validate().map_err(actor::Error::Profile)?;
        if let Some(existing) = self.actor()? {
            return Err(actor::Error::Exists(existing.rid).into());
        }

        let radicle_profile = self.profile();
        let signer = radicle_profile.signer()?;
        let public_key = radicle_profile.public_key;
        let did = radicle_profile.did();
        let alias = radicle_profile.config.node.alias.to_string();
        let name = actor::repo_name(&profile.display_name, &alias);
        let doc = actor::initial_doc(&name, NEW_BRANCH, did)?;
        // The id is the document's hash, so a retired actor or a leftover of
        // the same name has it already.
        let rid = RepoId::from(doc.encode().map_err(actor::Error::Doc)?.0);
        if radicle::storage::git::paths::repository(&radicle_profile.storage, &rid).exists() {
            return Err(actor::Error::NameTaken(name).into());
        }

        let (repo, identity) = Repository::init(&doc, &radicle_profile.storage, &signer)?;

        // Everything after `init` must land, or the repository goes away:
        // a half-built one would block every later attempt as "exists".
        let finish = || -> Result<(Vec<IdentityDocRevision>, ResolvedActor), Error> {
            let tree = actor::profile_tree(&repo.backend, None, &profile)?;
            let signature = repo.backend.signature()?;
            let branch = git::fmt::RefString::try_from(NEW_BRANCH)
                .expect("NEW_BRANCH is a valid branch name");
            let branch = git::refs::storage::branch_of(&public_key, &branch);
            repo.backend.commit(
                Some(branch.as_str()),
                &signature,
                &signature,
                "Create profile",
                &tree,
                &[],
            )?;

            repo.set_remote_identity_root_to(&public_key, identity)?;
            repo.set_identity_head_to(identity)?;
            repo.set_canonical_symbolic_refs("set-canonical from actor init")?;
            repo.set_default_branch_to_canonical_head()?;
            repo.sign_refs(&signer)?;

            let history = actor::identity_history(&repo)?;
            let resolved = actor::resolve(rid, &history).ok_or(actor::Error::NotFound)?;
            Ok((history, resolved))
        };
        let remove = || {
            if let Err(removal) = repo.remove() {
                log::error!("Not able to remove the half-built actor repository {rid}: {removal}");
            }
        };
        let (history, resolved) = match finish() {
            Ok(finished) => finished,
            Err(e) => {
                remove();
                return Err(e);
            }
        };

        // Seeded only once the actor resolves, so a removal above leaves no
        // policy behind. A repository the node will not seed is removed too,
        // since no peer could fetch it.
        let mut node = Node::new(radicle_profile.home().socket_from_env());
        if let Err(e) = radicle_profile.seed(rid, node::policy::Scope::All, &mut node) {
            remove();
            return Err(e.into());
        }
        // Peers learn a new repository from the node's inventory, which it
        // gossips at once, so this is the announcement; a refs announcement
        // would reach only peers that seed it already, and none does yet.
        if opts.announce()
            && node.is_running()
            && let Err(e) = node.add_inventory(rid)
        {
            log::error!("Not able to add {rid} to the node's inventory: {e}");
        }
        actor_info(self, &repo, &history, resolved)
    }

    /// The actor after saving `profile`. It becomes the actor's profile at once
    /// when this key alone controls the actor, and otherwise waits for the other
    /// controllers. `ProfileNewer` if the saved profile is from a newer client,
    /// `Diverged` if the controllers' branches have split. Scans every
    /// repository.
    fn update_actor_profile(
        &self,
        profile: ActorProfile,
        opts: CobOptions,
    ) -> Result<ActorInfo, Error> {
        let profile = profile.normalized();
        profile.validate().map_err(actor::Error::Profile)?;
        let (current, repo) = current(self)?;
        if current.profile_newer {
            return Err(actor::Error::ProfileNewer.into());
        }

        let radicle_profile = self.profile();
        let signer = radicle_profile.signer()?;
        let public_key = radicle_profile.public_key;
        let default_branch = repo.identity_doc()?.project()?.default_branch().clone();
        let branch = git::refs::storage::branch_of(&public_key, &default_branch);

        // A controller under a threshold of one moves the canonical branch
        // alone, and the move fails only when the controllers' branches have
        // split, which is reported. Any other key writes its own branch and
        // waits for the others.
        let did = radicle_profile.did();
        let decides_alone = current.threshold == 1
            && current
                .keys
                .iter()
                .any(|key| key.controller && key.did == did);

        // The new commit extends the canonical head, so a save from a device
        // that is behind does not fork the branch: the form carries the whole
        // profile. No head at all means the first commit.
        let local = repo
            .backend
            .find_reference(branch.as_str())
            .ok()
            .and_then(|reference| reference.peel_to_commit().ok());
        let parent = match current.head {
            Some(base) => Some(repo.backend.find_commit(base.into())?),
            None => local.clone(),
        };
        // Without a canonical head the file replaced is this key's own, which
        // `actor` did not read.
        if current.head.is_none()
            && let Some(parent) = &parent
            && let actor::ProfileFile::Read(read) =
                actor::read_profile(&repo.backend, parent.id().into())?
            && read.newer
        {
            return Err(actor::Error::ProfileNewer.into());
        }
        let parent_tree = parent.as_ref().map(|commit| commit.tree()).transpose()?;
        let tree = actor::profile_tree(&repo.backend, parent_tree.as_ref(), &profile)?;
        let unchanged = parent
            .as_ref()
            .is_some_and(|parent| tree.id() == parent.tree_id());
        if unchanged && local.as_ref().map(|c| c.id()) == parent.as_ref().map(|c| c.id()) {
            return Ok(current);
        }
        let commit = match &parent {
            // The canonical profile again: the branch goes back onto its
            // commit, which takes back an edit this key made on its own.
            Some(parent) if unchanged => parent.id(),
            _ => {
                let parents = parent.iter().collect::<Vec<_>>();
                let signature = repo.backend.signature()?;
                repo.backend.commit(
                    None,
                    &signature,
                    &signature,
                    &format!("Edit {PROFILE_PATH}"),
                    &tree,
                    &parents,
                )?
            }
        };
        let canonical = format!("refs/heads/{default_branch}");
        let canonical_before = repo.backend.refname_to_id(&canonical).ok();
        // By force, since git only moves a ref to a commit whose parent is
        // the ref's tip, which a device that is behind does not have; but
        // only from the tip that was read, so a second writer since then
        // keeps its branch and the undo below never restores a stale tip.
        repo.backend.reference_matching(
            branch.as_str(),
            commit,
            true,
            local
                .as_ref()
                .map_or(git::raw::Oid::ZERO_SHA1, |local| local.id()),
            "actor: edit profile",
        )?;

        // An unsigned move would be invisible to peers, so it is undone when
        // signing fails: the local branch and the canonical one, which may
        // already point at the new commit.
        let publish = || -> Result<bool, Error> {
            // Only a missing quorum is waited out; any other failure undoes
            // the edit.
            let moved = match repo.set_default_branch_to_canonical_head() {
                Ok(_) => true,
                Err(RepositoryError::Quorum(e)) => {
                    log::warn!("The canonical head of {} has no quorum: {e}", current.rid);
                    false
                }
                Err(e) => return Err(e.into()),
            };
            repo.sign_refs(&signer)?;
            Ok(moved)
        };
        let moved = match publish() {
            Ok(moved) => moved,
            Err(e) => {
                let restore = |name: &str, oid: Option<git::raw::Oid>| match oid {
                    Some(oid) => repo
                        .backend
                        .reference(name, oid, true, "actor: undo edit")
                        .map(|_| ()),
                    None => repo
                        .backend
                        .find_reference(name)
                        .and_then(|mut reference| reference.delete()),
                };
                // Each restore runs whether or not the other one does.
                let restores = [
                    restore(branch.as_str(), local.as_ref().map(|local| local.id())),
                    restore(&canonical, canonical_before),
                ];
                for undo in restores.into_iter().filter_map(Result::err) {
                    log::error!(
                        "Not able to undo the profile edit on {}: {undo}",
                        current.rid
                    );
                }
                return Err(e);
            }
        };

        if opts.announce() {
            let mut node = Node::new(radicle_profile.home().socket_from_env());
            announce(&mut node, current.rid, public_key);
        }

        if decides_alone && !moved {
            return Err(actor::Error::Diverged.into());
        }
        reread(self, &repo)
    }

    /// An enrollment code with the local key's consent to join the actor at
    /// `rid`, for one of its controllers to approve. Writes nothing. `NotFetched`
    /// if `rid` is not in storage, `Blocked` if the user blocked it, `Exists` if
    /// the key has an actor, `NotJoinable` if `rid` is not a live individual
    /// actor. Scans every repository.
    fn join_actor(&self, rid: RepoId) -> Result<String, Error> {
        if let Some(existing) = self.actor()? {
            return Err(actor::Error::Exists(existing.rid).into());
        }
        let radicle_profile = self.profile();
        if !radicle::storage::git::paths::repository(&radicle_profile.storage, &rid).exists() {
            // The row the user set, not the node's default for a missing one.
            let policies = radicle_profile.policies()?;
            if let Some(row) = (*policies).seed_policy(&rid)?
                && matches!(row.policy, node::policy::SeedingPolicy::Block)
            {
                return Err(actor::Error::Blocked(rid).into());
            }
            return Err(actor::Error::NotFetched(rid).into());
        }
        let repo = radicle_profile.storage.repository(rid)?;
        let history = actor::identity_history(&repo)?;
        actor::resolve(rid, &history)
            .filter(ResolvedActor::is_live_individual)
            .ok_or(actor::Error::NotJoinable(rid))?;
        let parent = history
            .last()
            .expect("a resolved history has a revision")
            .commit;
        let signer = radicle_profile.signer()?;
        Ok(Enrollment::sign(rid, parent, &signer).encode())
    }

    /// The actor after binding the key that signed `code`, as a controller too
    /// if `controller` is set. It applies at once when this key's vote is a
    /// majority, and otherwise waits for the other controllers. Fails as
    /// `checked_enrollment` does. Scans every repository.
    fn approve_enrollment(
        &self,
        code: String,
        controller: bool,
        opts: CobOptions,
    ) -> Result<ActorInfo, Error> {
        let CheckedEnrollment {
            enrollment,
            repo,
            history,
        } = checked_enrollment(self, &code)?;
        let head = history.last().expect("an actor's history has a revision");
        // A vote signs the whole document, so only a change that is exactly
        // this enrollment gets it: one that adds more, or gives the key
        // another role, gets a change of its own next to it.
        let doc = actor::enrolled_doc(&head.doc, &enrollment, controller)?;
        let description = format!("Bind {}", enrollment.did);
        vote_or_propose(self, &repo, &history, &doc, "Enroll key", description, opts)
    }

    /// The key that signed `code`, for the user to compare with the other
    /// machine before approving. Writes nothing. Fails as `checked_enrollment`
    /// does. Scans every repository.
    fn decode_enrollment(&self, code: String) -> Result<EnrollmentPreview, Error> {
        let CheckedEnrollment {
            enrollment,
            history,
            ..
        } = checked_enrollment(self, &code)?;
        let head = history.last().expect("an actor's history has a revision");
        let radicle_profile = self.profile();
        Ok(EnrollmentPreview {
            did: enrollment.did,
            alias: radicle_profile.aliases().alias(&enrollment.did),
            controller: head.doc.is_delegate(&enrollment.did),
        })
    }

    /// The actor after removing `did` from its keys and controllers. It applies
    /// at once when this key's vote is a majority, and otherwise waits for the
    /// other controllers. `RemoveSelf` for the local key, `KeyNotFound` for a key
    /// the actor does not have, and the errors of `may_change_identity`. Scans
    /// every repository.
    fn remove_actor_key(&self, did: Did, opts: CobOptions) -> Result<ActorInfo, Error> {
        let ActorWithHistory {
            current,
            repo,
            history,
        } = actor_with_history(self)?;
        may_change_identity(self, &current)?;
        let local = self.profile().did();
        // Keeping the local key keeps a controller this machine signs with,
        // so the actor never ends up without one.
        if did == local {
            return Err(actor::Error::RemoveSelf.into());
        }
        if !current.keys.iter().any(|key| key.did == did) {
            return Err(actor::Error::KeyNotFound(did).into());
        }
        let head = history.last().expect("an actor's history has a revision");
        let doc = actor::removed_doc(&head.doc, &did)?;
        let description = format!("Remove {did}");
        vote_or_propose(self, &repo, &history, &doc, "Remove key", description, opts)
    }

    /// The actor after accepting the open identity change `id`.
    /// `RevisionNotFound`, `AlreadyVoted`, `RevisionUnreadable` if Desktop cannot
    /// show the whole change, and the errors of `may_change_identity`. Scans
    /// every repository.
    fn approve_actor_revision(&self, id: git::Oid, opts: CobOptions) -> Result<ActorInfo, Error> {
        let local = self.profile().did();
        vote(
            self,
            id,
            opts,
            |current, open| {
                may_change_identity(self, current)?;
                if open.accepted.contains(&local) {
                    return Err(actor::Error::AlreadyVoted.into());
                }
                // A vote signs the whole document, what Desktop does not show
                // of it included.
                if open.unreadable {
                    return Err(actor::Error::RevisionUnreadable.into());
                }
                Ok(())
            },
            |identity| identity.accept(&id),
        )
    }

    /// The actor after withdrawing the open identity change `id`. `NotAuthor`
    /// if another key proposed it. Scans every repository.
    fn withdraw_actor_revision(&self, id: git::Oid, opts: CobOptions) -> Result<ActorInfo, Error> {
        let local = self.profile().did();
        vote(
            self,
            id,
            opts,
            |_, open| {
                if open.author != local {
                    return Err(actor::Error::NotAuthor.into());
                }
                Ok(())
            },
            |identity| identity.redact(id),
        )
    }

    /// The actor after rejecting the open identity change `id`.
    /// `NotController`, `AlreadyVoted`, `RevisionNotFound`. Scans every
    /// repository.
    fn reject_actor_revision(&self, id: git::Oid, opts: CobOptions) -> Result<ActorInfo, Error> {
        let local = self.profile().did();
        vote(
            self,
            id,
            opts,
            |current, open| {
                // A rejection signs a verdict, not the document, so a payload
                // of a newer version is no bar to it.
                controls(self, current)?;
                if open.accepted.contains(&local) {
                    return Err(actor::Error::AlreadyVoted.into());
                }
                Ok(())
            },
            |identity| identity.reject(id),
        )
    }
}

/// `NotController` unless the local key is a controller of the actor.
fn controls<A: Actor + ?Sized>(actor: &A, current: &ActorInfo) -> Result<(), Error> {
    let local = actor.profile().did();
    if !current
        .keys
        .iter()
        .any(|key| key.did == local && key.controller)
    {
        return Err(actor::Error::NotController.into());
    }
    Ok(())
}

/// `NotController` unless the local key is a controller, `PayloadNewer` if the
/// payload is from a newer client.
fn may_change_identity<A: Actor + ?Sized>(actor: &A, current: &ActorInfo) -> Result<(), Error> {
    controls(actor, current)?;
    if current.payload_newer {
        return Err(actor::Error::PayloadNewer.into());
    }
    Ok(())
}

/// The actor after accepting the open identity change whose document is
/// `doc`, or proposing `doc` if there is none, and publishing.
fn vote_or_propose<A: Actor + ?Sized>(
    actor: &A,
    repo: &Repository,
    history: &[IdentityDocRevision],
    doc: &Doc,
    title: &str,
    description: String,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    let radicle_profile = actor.profile();
    let local = radicle_profile.did();
    let matching = actor::open_revisions(repo, repo.id, history)?
        .into_iter()
        .find(|open| open.doc == *doc);

    let signer = radicle_profile.signer()?;
    let mut identity = Identity::load_mut(repo, &signer)?;
    match matching {
        // Accepted already, maybe by an attempt that failed to publish;
        // publishing again is the retry.
        Some(open) if open.accepted.contains(&local) => {}
        Some(open) => {
            identity.accept(&open.id).map_err(vote_error)?;
        }
        None => {
            let title = Title::new(title).expect("the title is valid");
            identity
                .update(title, description, doc)
                .map_err(vote_error)?;
        }
    }
    publish_identity(actor, repo, opts)
}

/// The actor after pointing the identity at what the votes accept, then
/// signing and announcing the refs.
fn publish_identity<A: Actor + ?Sized>(
    actor: &A,
    repo: &Repository,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    let radicle_profile = actor.profile();
    repo.set_identity_head()?;
    repo.sign_refs(&radicle_profile.signer()?)?;
    if opts.announce() {
        let mut node = Node::new(radicle_profile.home().socket_from_env());
        announce(&mut node, repo.id, radicle_profile.public_key);
    }
    reread(actor, repo)
}

/// The actor in `repo` as it is now, which may no longer bind the local key.
fn reread<A: Actor + ?Sized>(actor: &A, repo: &Repository) -> Result<ActorInfo, Error> {
    let history = actor::identity_history(repo)?;
    let resolved = actor::resolve(repo.id, &history).ok_or(actor::Error::NotFound)?;
    actor_info(actor, repo, &history, resolved)
}

/// The actor in `repo` as Desktop shows it, with the profile as the file
/// holds it, so the editor shows what `validate` would refuse.
fn actor_info<A: Actor + ?Sized>(
    actor: &A,
    repo: &Repository,
    history: &[IdentityDocRevision],
    resolved: ResolvedActor,
) -> Result<ActorInfo, Error> {
    let profile = actor.profile();
    let aliases = profile.aliases();
    let local = profile.public_key;
    let doc = &history
        .last()
        .expect("a resolved history has a revision")
        .doc;
    let head = repo.head().ok().map(|(_, oid)| oid);
    let read = match head {
        Some(head) => actor::read_profile(&repo.backend, head)?,
        None => actor::ProfileFile::Missing,
    };
    let (file, profile_newer, profile_unreadable) = match read {
        actor::ProfileFile::Read(read) => (Some(read.profile.clone()), read.newer, false),
        actor::ProfileFile::Unreadable => (None, false, true),
        actor::ProfileFile::Missing => (None, false, false),
    };
    let key_of = |key: &actor::ResolvedKey| ActorKey {
        alias: if *key.did == local {
            Some(profile.config.node.alias.clone())
        } else {
            aliases.alias(&key.did)
        },
        did: key.did,
        bound: key.bound,
        controller: key.controller,
        added_at: key.added_at,
    };
    let keys = resolved.keys.iter().map(key_of).collect();
    let pending = pending(repo, history, &resolved, key_of)?;

    Ok(ActorInfo {
        rid: repo.id,
        kind: resolved.kind,
        keys,
        threshold: doc.threshold(),
        majority: doc.majority(),
        payload_newer: resolved.payload_newer,
        profile: file,
        profile_newer,
        profile_unreadable,
        head,
        pending,
    })
}

/// The open identity changes of the actor in `repo`, each with the keys it
/// adds and removes.
fn pending(
    repo: &Repository,
    history: &[IdentityDocRevision],
    resolved: &ResolvedActor,
    key_of: impl Fn(&actor::ResolvedKey) -> ActorKey,
) -> Result<Vec<ActorRevision>, Error> {
    let doc = &history
        .last()
        .expect("a resolved history has a revision")
        .doc;
    let pending = actor::open_revisions(repo, repo.id, history)?
        .into_iter()
        .map(|open| {
            let (added, removed) = match &open.resolved {
                Some(proposed) => (
                    proposed
                        .keys
                        .iter()
                        .filter(|key| !resolved.keys.contains(key))
                        .map(&key_of)
                        .collect(),
                    resolved
                        .keys
                        .iter()
                        .filter(|key| !proposed.keys.iter().any(|k| k.did == key.did))
                        .map(|key| key.did)
                        .collect(),
                ),
                None => (Vec::new(), Vec::new()),
            };
            // A keys entry the change edits without adding or removing that
            // key is one Desktop does not show.
            let shown = added
                .iter()
                .map(|key: &ActorKey| key.did)
                .chain(removed.iter().copied())
                .map(|did| did.to_string())
                .collect::<Vec<_>>();
            let hidden = actor::changed_key_entries(doc, &open.doc)
                .iter()
                .any(|entry| !shown.contains(entry));
            ActorRevision {
                id: open.id,
                author: open.author,
                created_at: open.time,
                added,
                removed,
                threshold: (open.doc.threshold() < doc.threshold()).then_some(open.doc.threshold()),
                accepted: open
                    .accepted
                    .into_iter()
                    .filter(|did| doc.is_delegate(did))
                    .collect(),
                rejected: open
                    .rejected
                    .into_iter()
                    .filter(|did| doc.is_delegate(did))
                    .collect(),
                unreadable: open
                    .resolved
                    .as_ref()
                    .is_none_or(|proposed| proposed.payload_newer)
                    || !actor::changes_only_keys(doc, &open.doc)
                    || hidden,
            }
        })
        .collect();
    Ok(pending)
}

/// Every readable repository in storage with its current identity document.
/// Unlike radicle's own listing, it keeps one whose default branch has no
/// quorum.
fn repositories(storage: &radicle::storage::git::Storage) -> Result<Vec<(RepoId, Doc)>, Error> {
    let mut repos = Vec::new();
    for entry in std::fs::read_dir(storage.path())? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let Ok(rid) = RepoId::try_from(entry.file_name()) else {
            continue;
        };
        match storage.repository(rid).and_then(|repo| repo.identity_doc()) {
            Ok(doc) => repos.push((rid, doc.into())),
            Err(e) => log::warn!("Skipping {rid} while looking for the actor: {e}"),
        }
    }
    Ok(repos)
}

/// What `actor` finds, with its repository. `NotFound` if there is none.
/// Scans every repository.
fn current<A: Actor + ?Sized>(actor: &A) -> Result<(ActorInfo, Repository), Error> {
    let current = actor.actor()?.ok_or(actor::Error::NotFound)?;
    let repo = actor.profile().storage.repository(current.rid)?;
    Ok((current, repo))
}

/// The actor after applying `vote` to the open identity change `id`, once
/// `check` passes, and publishing. `RevisionNotFound` if no open change has
/// `id`. Scans every repository.
fn vote<A: Actor + ?Sized>(
    actor: &A,
    id: git::Oid,
    opts: CobOptions,
    check: impl FnOnce(&ActorInfo, &ActorRevision) -> Result<(), Error>,
    cast: impl FnOnce(&mut IdentityMut<'_, '_, Repository, Signer>) -> Result<EntryId, identity::Error>,
) -> Result<ActorInfo, Error> {
    let (current, repo) = current(actor)?;
    let open = current
        .pending
        .iter()
        .find(|open| open.id == id)
        .ok_or(actor::Error::RevisionNotFound(id))?;
    check(&current, open)?;
    let signer = actor.profile().signer()?;
    // A key gets one verdict on a change, and one accepted change per
    // identity version; the identity enforces both, and its refusal maps to
    // Desktop's errors.
    cast(&mut Identity::load_mut(&repo, &signer)?).map_err(vote_error)?;
    publish_identity(actor, &repo, opts)
}

/// The app's error for `e`, which the identity raised on a vote.
fn vote_error(e: identity::Error) -> Error {
    vote_refused(&e).unwrap_or_else(|| e.into())
}

/// The app's error for a vote the identity refused because the key already
/// voted on the change or accepted another at the same version.
fn vote_refused(e: &identity::Error) -> Option<Error> {
    match e {
        identity::Error::Apply(ApplyError::DuplicateVerdict) => {
            Some(actor::Error::AlreadyVoted.into())
        }
        identity::Error::Apply(ApplyError::SiblingAccepted { .. }) => {
            Some(actor::Error::VotedElsewhere.into())
        }
        identity::Error::Store(cob::store::Error::Update(cob::error::Update::Evaluate(inner))) => {
            inner
                .downcast_ref::<identity::Error>()
                .and_then(vote_refused)
        }
        _ => None,
    }
}

/// The local actor, with what an identity change builds on.
struct ActorWithHistory {
    current: ActorInfo,
    repo: Repository,
    /// The actor's identity history, root first.
    history: Vec<IdentityDocRevision>,
}

/// The local actor with its repository and identity history. The caller
/// checks `may_change_identity`.
fn actor_with_history<A: Actor + ?Sized>(actor: &A) -> Result<ActorWithHistory, Error> {
    let (current, repo) = current(actor)?;
    let history = actor::identity_history(&repo)?;
    Ok(ActorWithHistory {
        current,
        repo,
        history,
    })
}

/// An enrollment code that passed every check but the vote.
struct CheckedEnrollment {
    enrollment: Enrollment,
    repo: Repository,
    /// The actor's identity history, ending at the code's anchor.
    history: Vec<IdentityDocRevision>,
}

/// The enrollment in `code`, checked against the local actor. `WrongActor`,
/// `InvalidCode`, `AlreadyBound`, `Stale` if the identity changed since the
/// code was made, and the errors of `may_change_identity`.
fn checked_enrollment<A: Actor + ?Sized>(
    actor: &A,
    code: &str,
) -> Result<CheckedEnrollment, Error> {
    let enrollment = Enrollment::decode(code).map_err(|_| actor::Error::InvalidCode)?;
    let ActorWithHistory {
        current,
        repo,
        history,
    } = actor_with_history(actor)?;
    if enrollment.rid != current.rid {
        return Err(actor::Error::WrongActor(enrollment.rid).into());
    }
    may_change_identity(actor, &current)?;
    if !enrollment.verifies() {
        return Err(actor::Error::InvalidCode.into());
    }
    if current
        .keys
        .iter()
        .any(|key| key.did == enrollment.did && key.bound)
    {
        return Err(actor::Error::AlreadyBound.into());
    }

    let head = history.last().expect("an actor's history has a revision");
    // The consent is anchored to the identity it saw; on any other it binds
    // nothing, and the joining key has to make a new code.
    if enrollment.parent != head.commit {
        return Err(actor::Error::Stale.into());
    }
    // Whether the payload has room for the key does not depend on its role.
    actor::enrolled_doc(&head.doc, &enrollment, false)?;
    Ok(CheckedEnrollment {
        enrollment,
        repo,
        history,
    })
}

/// Announce new refs; a node that is not running announces them when it
/// starts.
fn announce(node: &mut Node, rid: RepoId, public_key: PublicKey) {
    if node.is_running()
        && let Err(e) = node.announce_refs_for(rid, [public_key])
    {
        log::error!("Not able to announce changes: {e}");
    }
}

#[cfg(test)]
mod tests;
