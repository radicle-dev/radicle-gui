use std::collections::BTreeSet;
use std::path::Path;

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
    ActorFork, ActorInfo, ActorKey, ActorPayload, ActorProfile, ActorRevision, Enrollment,
    EnrollmentPreview, IdentityDocRevision, KeyProfiles, PROFILE_PATH, ProfileEdit, ProfileImages,
    ResolvedActor, ShownProfile,
};
use crate::cobs::{CobOptions, PaginatedQuery};
use crate::error::Error;
use crate::traits::repo::Repo;

/// The default branch a new actor repository gets; after that, the default
/// branch is whatever its identity document names.
const NEW_BRANCH: &str = "main";

pub trait Actor: Repo {
    /// The local actor, the one live individual actor that binds the local key.
    /// `None` if there is none, `Ambiguous` if there are several, `ActorNewer`
    /// as `bound` says. Scans every repository.
    fn actor(&self) -> Result<Option<ActorInfo>, Error> {
        bound(self)?
            .map(|(repo, history, resolved)| actor_info(self, &repo, &history, resolved))
            .transpose()
    }

    /// The new actor for the local key, with `profile` and `images` as its first
    /// commit; a failure leaves nothing behind. `Exists` if the key has an
    /// actor, `Profile` if `profile` or a picture is invalid, `NameTaken` if the
    /// key had an actor of that name, and the errors of `actor`. Scans every
    /// repository.
    fn create_actor(
        &self,
        profile: ActorProfile,
        images: ProfileImages,
        opts: CobOptions,
    ) -> Result<ActorInfo, Error> {
        let (profile, images) = images.place(profile).map_err(actor::Error::Profile)?;
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
            let tree = actor::profile_tree_with(&repo.backend, None, &profile, &images, &[])?;
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

    /// The actor after saving `profile`, and `images` next to it, each named by
    /// its field of the profile. It becomes the actor's profile at once when
    /// this key alone controls the actor, and otherwise waits for the other
    /// controllers. Where it applies at once it also replaces the versions on
    /// the other controllers' branches that are not behind it: those stay in
    /// the history, and no file of theirs is carried over but a picture the
    /// saved profile names and only theirs has; where both have a file of
    /// that name, this key's stays. `Profile` if `profile` or a picture is
    /// invalid; `ProfileNewer` if the saved profile, or one it would replace,
    /// is from a newer client; `Diverged` if the controllers' branches have
    /// split and the save could not close it, which happens when several other
    /// controllers' branches have split from each other too; a save by a second
    /// controller that has this one's commit closes it. Scans every repository.
    fn update_actor_profile(
        &self,
        profile: ActorProfile,
        images: ProfileImages,
        opts: CobOptions,
    ) -> Result<ActorInfo, Error> {
        let (profile, images) = images.place(profile).map_err(actor::Error::Profile)?;
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
        let decides_alone = decides_alone(current.threshold, &current.keys, &did);

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
        // The save replaces the other controllers' versions that are not
        // behind the canonical head, so one from a newer client stops it. The
        // new commit takes them as parents: it then descends from every side
        // of a split, and the canonical branch can move again.
        if current.forks.iter().any(|fork| fork.profile_newer) {
            return Err(actor::Error::ProfileNewer.into());
        }
        let mut seen = BTreeSet::new();
        let forks = current
            .forks
            .iter()
            .filter(|fork| seen.insert(fork.head))
            .map(|fork| repo.backend.find_commit(fork.head.into()))
            .collect::<Result<Vec<_>, _>>()?;
        let parent_tree = parent.as_ref().map(|commit| commit.tree()).transpose()?;
        let their_trees = forks
            .iter()
            .map(|commit| commit.tree())
            .collect::<Result<Vec<_>, _>>()?;
        let tree = actor::profile_tree_with(
            &repo.backend,
            parent_tree.as_ref(),
            &profile,
            &images,
            &their_trees,
        )?;
        let unchanged = forks.is_empty()
            && parent
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
                let parents = parent.iter().chain(&forks).collect::<Vec<_>>();
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

    /// The changes to the local actor's identity that `ActorInfo::pending`
    /// does not list, newest first, down to its first version: the ones that
    /// ended, and one still open that waits on another open change. A change
    /// its author withdrew is not among them. Reads the whole identity
    /// history and resolves the actor twice for each change, which stays
    /// cheap while that history is as short as an actor's is meant to be.
    /// `NotFound` if the key has no actor, and the errors of `actor`. Scans
    /// every repository.
    fn closed_actor_revisions(&self) -> Result<Vec<ActorRevision>, Error> {
        let (repo, _, _) = bound(self)?.ok_or(actor::Error::NotFound)?;
        let key_of = key_shown(self);

        Ok(actor::closed_revisions(&repo, repo.id)?
            .into_iter()
            .map(|closed| closed_revision(closed, &key_of))
            .collect())
    }

    /// The versions of the local actor's profile that this key has: those
    /// behind the profile `actor` shows, and those this key saved on its own
    /// branch that are not part of it yet. Each comes before every version
    /// it was saved over. Gives `take` of them after the first `skip`, or all
    /// without `take`; a caller that pages while the profile moves gets a
    /// version twice, never misses one. Reads two versions for each one
    /// returned and checks its ancestry once. `NotFound` if the key has no
    /// actor, and the errors of `actor`. Scans every repository.
    fn actor_profile_history(
        &self,
        skip: Option<usize>,
        take: Option<usize>,
    ) -> Result<PaginatedQuery<Vec<ProfileEdit>>, Error> {
        let (repo, _, _) = bound(self)?.ok_or(actor::Error::NotFound)?;
        let cursor = skip.unwrap_or(0);

        let head = repo.head().ok().map(|(_, oid)| git::raw::Oid::from(oid));
        let default_branch = repo.identity_doc()?.project()?.default_branch().clone();
        let branch = git::refs::storage::branch_of(&self.profile().public_key, &default_branch);
        let own = repo.backend.refname_to_id(branch.as_str()).ok();

        let mut walk = repo.backend.revwalk()?;
        walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;

        for tip in head.iter().chain(&own) {
            walk.push(*tip)?;
        }

        // One more than asked for says whether there are more.
        let mut content = walk
            .skip(cursor)
            .take(take.map_or(usize::MAX, |take| take.saturating_add(1)))
            .map(|oid| profile_edit(&repo, oid?, head))
            .collect::<Result<Vec<_>, _>>()?;
        let more = take.is_some_and(|take| content.len() > take);
        if let Some(take) = take {
            content.truncate(take);
        }

        Ok(PaginatedQuery {
            cursor,
            more,
            content,
        })
    }

    /// The actor at `rid` as it is before the local key joins it, for the user
    /// to see what they would consent to. Writes and signs nothing. `NotFetched`
    /// if `rid` is not in storage, `Blocked` if the user blocked it, `CopyStuck`
    /// if the node can no longer fetch into the copy, `Exists` if the key has
    /// an actor, `NotJoinable` if `rid` is not a live individual actor, and the
    /// errors of `actor`. Scans every repository.
    fn joinable_actor(&self, rid: RepoId) -> Result<ActorInfo, Error> {
        let Joinable {
            repo,
            history,
            resolved,
        } = joinable(self, rid)?;

        // The join needs only the identity.
        actor_by_identity(self, &repo, &history, resolved)
    }

    /// An enrollment code with the local key's consent to join the actor at
    /// `rid`, for one of its controllers to approve. Writes nothing. Fails as
    /// `joinable_actor` does. Scans every repository.
    fn join_actor(&self, rid: RepoId) -> Result<String, Error> {
        let Joinable { history, .. } = joinable(self, rid)?;
        let parent = history
            .last()
            .expect("a resolved history has a revision")
            .commit;
        let signer = self.profile().signer()?;

        Ok(Enrollment::sign(rid, parent, &signer).encode())
    }

    /// The actor after binding the key that signed `code`, as a controller too
    /// if `controller` is set. It applies at once when this key's vote is a
    /// majority, and otherwise waits for the other controllers. Fails as
    /// `checked_enrollment` does. If the identity changes meanwhile: `Stale`
    /// when the code no longer fits it, `Moved` otherwise. Scans every
    /// repository.
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
        let description = format!("Add {}", enrollment.did);
        vote_or_propose(self, &repo, &history, &doc, "Add key", description, opts).or_else(|e| {
            // Another try helps only while the code still fits the identity;
            // once it does not, the check says so.
            if matches!(e, Error::Actor(actor::Error::Moved)) {
                checked_enrollment(self, &code)?;
            }
            Err(e)
        })
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
    /// the actor does not have, `Moved` if the identity changed meanwhile, and
    /// the errors of `may_change_identity`. Scans every repository.
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

        remove_key(self, &repo, &history, did, opts)
    }

    /// Every live individual actor that binds the local key: more than one
    /// when `actor` answers `Ambiguous`, for the user to pick the one to leave.
    /// One that cannot be shown is left out, with a warning in the log. Writes
    /// nothing. Scans every repository.
    fn actors_of_key(&self) -> Result<Vec<ActorInfo>, Error> {
        let (found, _) = bindings(self)?;

        // One that cannot be shown must not hide the rest.
        Ok(found
            .into_iter()
            .filter_map(|(repo, history, resolved)| {
                actor_by_identity(self, &repo, &history, resolved)
                    .inspect_err(|e| log::warn!("Not able to show the actor {}: {e}", repo.id))
                    .ok()
            })
            .collect())
    }

    /// The live individual actor in storage that binds each key, and the
    /// profile of each of those actors that has one to show: on its canonical
    /// branch, one a save would accept. A key whose actor has none keeps its
    /// alias, and the log says why at debug level. An actor whose history or
    /// profile cannot be read is treated as having none, with a warning in the
    /// log. Reads nothing from the network and writes nothing. Scans every
    /// repository, and reads the identity history and the profile of each
    /// actor's, one repository at a time.
    fn key_profiles(&self) -> Result<KeyProfiles, Error> {
        let storage = &self.profile().storage;

        // Each repository is closed before the next is opened: a node may
        // hold more actors than a process may hold files.
        let mut actors = Vec::new();
        for (rid, doc) in repositories(storage)? {
            if ActorPayload::of(&doc).is_none() {
                continue;
            }
            let Some((repo, _, resolved)) = resolved_at(storage, rid) else {
                continue;
            };
            let profile = resolved
                .is_live_individual()
                .then(|| shown_profile(&repo))
                .flatten();

            actors.push((rid, resolved, profile));
        }

        let keys = actor::actors_of_keys(actors.iter().map(|(rid, resolved, _)| (*rid, resolved)));
        let bound = keys.values().copied().collect::<BTreeSet<_>>();
        let profiles = actors
            .into_iter()
            .filter(|(rid, _, _)| bound.contains(rid))
            .filter_map(|(rid, _, profile)| Some((rid, profile?)))
            .collect();

        Ok(KeyProfiles { profiles, keys })
    }

    /// The actor at `rid` after the local key's vote to remove itself from
    /// it, which is how a key bound to several actors gets back to one. It
    /// proposes the removal, or accepts it if another controller proposed
    /// it, and the removal applies once a majority of the controllers has
    /// accepted. `NotBound` if `rid` does not bind the key, `RemoveSelf` if no
    /// other actor does, `Leaving` if the key's vote to leave another actor is
    /// still open, `LeaveNeedsController` if the key has no vote in `rid`,
    /// `PayloadNewer`, `OnlyController`, and `Moved` as `remove_actor_key`. It
    /// fails before writing if the profile file cannot be read. Scans every
    /// repository.
    fn leave_actor(&self, rid: RepoId, opts: CobOptions) -> Result<ActorInfo, Error> {
        let local = self.profile().did();
        let ((repo, history, resolved), others) = binding_at(self, rid)?;

        // The last actor that binds the key is its own, which it keeps.
        if others.is_empty() {
            return Err(actor::Error::RemoveSelf.into());
        }

        not_leaving(&others, &local)?;

        // Read as it is read back after the vote, so that a failure comes
        // before anything is written.
        let current = actor_info(self, &repo, &history, resolved)?;
        let controllers = current
            .keys
            .iter()
            .filter(|key| key.controller)
            .map(|key| key.did)
            .collect::<Vec<_>>();
        if !controllers.contains(&local) {
            return Err(actor::Error::LeaveNeedsController { rid, controllers }.into());
        }
        may_change_identity(self, &current)?;
        if controllers.len() == 1 {
            return Err(actor::Error::OnlyController(rid).into());
        }

        remove_key(self, &repo, &history, local, opts)
    }

    /// The actor at `rid` after withdrawing the open change by which the local
    /// key leaves it, which the key proposed with `leave_actor`. `NotBound` if
    /// `rid` does not bind the key, `NotLeaving` if no such change is open,
    /// `LeaveNotOwn` if another key proposed it, `Moved` if the withdrawal did
    /// not hold. It fails before writing if the profile file cannot be read.
    /// Scans every repository.
    fn cancel_leave(&self, rid: RepoId, opts: CobOptions) -> Result<ActorInfo, Error> {
        let local = self.profile().did();
        let ((repo, history, resolved), _) = binding_at(self, rid)?;

        // As in `leave_actor`: read first as it is read back afterwards.
        actor_info(self, &repo, &history, resolved)?;

        let open = leaves(&repo, &history, &local)?;
        let Some(own) = open.iter().find(|open| open.author == local) else {
            return Err(match open.is_empty() {
                true => actor::Error::NotLeaving(rid),
                false => actor::Error::LeaveNotOwn(rid),
            }
            .into());
        };
        let signer = self.profile().signer()?;
        Identity::load_mut(&repo, &signer)?
            .redact(own.id)
            .map_err(vote_error)?;
        let actor = publish_identity(self, &repo, opts)?;
        landed(&repo, &own.id, |change| {
            matches!(change.state, identity::State::Redacted(_))
        })?;

        Ok(actor)
    }

    /// The actor at `rid` after the local key retires it, which ends it for
    /// every key with no successor. Only for an actor the key alone controls,
    /// where its vote decides, and only while another actor binds the key
    /// too. `NotBound` if `rid` does not bind the key, `LastActor` if no other
    /// actor does, `Leaving` if the key's vote to leave another actor is
    /// still open, `NotController`, `PayloadNewer`, `RetireShared` if other
    /// keys control the actor too, `Moved`. It fails before writing if the
    /// profile file cannot be read. Scans every repository.
    fn retire_actor(&self, rid: RepoId, opts: CobOptions) -> Result<ActorInfo, Error> {
        let local = self.profile().did();
        let ((repo, history, resolved), others) = binding_at(self, rid)?;

        if others.is_empty() {
            return Err(actor::Error::LastActor(rid).into());
        }

        not_leaving(&others, &local)?;

        // As in `leave_actor`: read first as it is read back afterwards.
        let current = actor_info(self, &repo, &history, resolved)?;
        may_change_identity(self, &current)?;

        // A retirement that waited for other votes would be a change Desktop
        // can neither show, sign nor withdraw.
        if current.keys.iter().filter(|key| key.controller).count() > 1 {
            return Err(actor::Error::RetireShared(rid).into());
        }

        let head = history.last().expect("an actor's history has a revision");
        let doc = actor::retired_doc(&head.doc)?;
        let description = format!("Retire {rid}");

        vote_or_propose(
            self,
            &repo,
            &history,
            &doc,
            "Retire profile",
            description,
            opts,
        )
    }

    /// The actor after accepting the open identity change `id`.
    /// `RevisionNotFound`, `AlreadyVoted`, `VotedElsewhere`, `RevisionUnreadable`
    /// if Desktop cannot show the whole change, `Moved` if the vote did not
    /// hold, and the errors of `may_change_identity`. Scans every repository.
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
            |change| approved(change, &local),
        )
    }

    /// The actor after withdrawing the open identity change `id`.
    /// `RevisionNotFound`, `NotAuthor` if another key proposed it, `Moved` if
    /// the withdrawal did not hold. Scans every repository.
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
            |change| matches!(change.state, identity::State::Redacted(_)),
        )
    }

    /// The actor after rejecting the open identity change `id`.
    /// `NotController`, `AlreadyVoted`, `RevisionNotFound`, `Moved` if the
    /// rejection did not hold. Scans every repository.
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
            |change| {
                matches!(change.state, identity::State::Rejected(_))
                    || change.rejected().any(|did| did == local)
            },
        )
    }
}

/// The actor in `repo` after the local key's vote for the change that removes
/// `did` from its keys and controllers, as `vote_or_propose` casts it.
fn remove_key<A: Actor + ?Sized>(
    actor: &A,
    repo: &Repository,
    history: &[IdentityDocRevision],
    did: Did,
    opts: CobOptions,
) -> Result<ActorInfo, Error> {
    let head = history.last().expect("an actor's history has a revision");
    let doc = actor::removed_doc(&head.doc, &did)?;
    let description = format!("Remove {did}");

    vote_or_propose(actor, repo, history, &doc, "Remove key", description, opts)
}

/// `Leaving` if `did`'s vote to leave one of `others` is still open: that
/// leave and another end of a binding, both going through, would leave the
/// key in no actor.
fn not_leaving(others: &[Bound], did: &Did) -> Result<(), Error> {
    for (other, history, _) in others {
        if !leaves(other, history, did)?.is_empty() {
            return Err(actor::Error::Leaving(other.id).into());
        }
    }

    Ok(())
}

/// The open changes to the actor in `repo` that hold `did`'s vote and after
/// which the actor would no longer bind it, whatever else they do. A
/// retirement the key approved is not one of them; Desktop opens none that
/// stays open.
fn leaves(
    repo: &Repository,
    history: &[IdentityDocRevision],
    did: &Did,
) -> Result<Vec<actor::OpenIdentityRevision>, Error> {
    let unbinds = |open: &actor::OpenIdentityRevision| {
        open.resolved
            .as_ref()
            .is_none_or(|proposed| !proposed.bound_keys().any(|bound| bound == *did))
    };

    Ok(actor::open_revisions(repo, repo.id, history)?
        .into_iter()
        .filter(|open| open.accepted.contains(did) && unbinds(open))
        .collect())
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
/// `doc`, or proposing `doc` if there is none, and publishing. `Moved` if the
/// identity is no longer at the head of `history`, which `doc` was built on;
/// nothing is written then. `Moved` too if the change does not hold this
/// key's vote afterwards: by then the vote is written, signed and announced,
/// and counts for nothing.
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

    // `doc` and the open change were read from `history`. On any other head
    // they would undo what came in between, and a consent binds only on the
    // head it names.
    let head = history.last().expect("an actor's history has a revision");
    if identity.current != head.commit {
        return Err(actor::Error::Moved.into());
    }

    let id = match matching {
        // Accepted already, maybe by an attempt that failed to publish;
        // publishing again is the retry.
        Some(open) if open.accepted.contains(&local) => open.id,
        Some(open) => {
            identity.accept(&open.id).map_err(vote_error)?;
            open.id
        }
        None => {
            let title = Title::new(title).expect("the title is valid");
            identity
                .update(title, description, doc)
                .map_err(vote_error)?
        }
    };
    let actor = publish_identity(actor, repo, opts)?;
    landed(repo, &id, |change| approved(change, &local))?;

    Ok(actor)
}

/// `Moved` unless the identity in storage holds the change `id` as `held`
/// wants it. Something else can change the identity while a vote is written,
/// and the vote then counts for nothing without an error, so success is said
/// only of what is read back.
fn landed(
    repo: &Repository,
    id: &git::Oid,
    held: impl FnOnce(&identity::Revision) -> bool,
) -> Result<(), Error> {
    if repo.identity()?.revision(id).is_some_and(held) {
        Ok(())
    } else {
        Err(actor::Error::Moved.into())
    }
}

/// Whether `change` is the current identity, or open with `local`'s vote for
/// it.
fn approved(change: &identity::Revision, local: &Did) -> bool {
    change.is_accepted() || (change.is_active() && change.accepted().any(|did| did == *local))
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
    let head = repo.head().ok().map(|(_, oid)| oid);
    let read = profile_file(repo, head)?;

    actor_shown(actor, repo, history, resolved, head, read)
}

/// `actor_info` for a step that needs only the identity: a profile file that
/// cannot be read at all is shown as such and stops nothing.
fn actor_by_identity<A: Actor + ?Sized>(
    actor: &A,
    repo: &Repository,
    history: &[IdentityDocRevision],
    resolved: ResolvedActor,
) -> Result<ActorInfo, Error> {
    let head = repo.head().ok().map(|(_, oid)| oid);
    let read = profile_file(repo, head).unwrap_or_else(|e| {
        log::warn!("Not able to read the profile of {}: {e}", repo.id);
        actor::ProfileFile::Unreadable
    });

    actor_shown(actor, repo, history, resolved, head, read)
}

/// The profile file at `head`, the default branch's commit if it has one.
fn profile_file(
    repo: &Repository,
    head: Option<git::Oid>,
) -> Result<actor::ProfileFile, git::raw::Error> {
    match head {
        Some(head) => actor::read_profile(&repo.backend, head),
        None => Ok(actor::ProfileFile::Missing),
    }
}

/// `actor_info`, given the profile file `read` at `head`.
fn actor_shown<A: Actor + ?Sized>(
    actor: &A,
    repo: &Repository,
    history: &[IdentityDocRevision],
    resolved: ResolvedActor,
    head: Option<git::Oid>,
    read: actor::ProfileFile,
) -> Result<ActorInfo, Error> {
    let local = actor.profile().public_key;
    let doc = &history
        .last()
        .expect("a resolved history has a revision")
        .doc;
    let (file, profile_newer, profile_unreadable) = match read {
        actor::ProfileFile::Read(read) => (Some(read.profile.clone()), read.newer, false),
        actor::ProfileFile::Unreadable => (None, false, true),
        actor::ProfileFile::Missing => (None, false, false),
    };
    let key_of = key_shown(actor);
    let keys: Vec<ActorKey> = resolved.keys.iter().map(&key_of).collect();
    let pending = pending(repo, history, &resolved, &key_of)?;
    // Only a key that publishes alone can close a split, by saving.
    let forks = match head {
        Some(head) if decides_alone(doc.threshold(), &keys, &local.into()) => {
            forks(repo, doc, &resolved, &local, head)?
        }
        _ => Vec::new(),
    };

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
        forks,
    })
}

/// A key as Desktop shows it, with the name its node goes by.
fn key_shown<A: Actor + ?Sized>(actor: &A) -> impl Fn(&actor::ResolvedKey) -> ActorKey {
    let profile = actor.profile();
    let aliases = profile.aliases();
    let local = profile.public_key;
    let own = profile.config.node.alias.clone();

    move |key| ActorKey {
        alias: if *key.did == local {
            Some(own.clone())
        } else {
            aliases.alias(&key.did)
        },
        did: key.did,
        bound: key.bound,
        controller: key.controller,
        added_at: key.added_at,
    }
}

/// Whether `did` moves the canonical branch by itself: it is a controller
/// under a threshold of one.
fn decides_alone(threshold: usize, keys: &[ActorKey], did: &Did) -> bool {
    threshold == 1 && keys.iter().any(|key| key.controller && key.did == *did)
}

/// The versions of the profile on the branches of the controllers other than
/// `local` that are not behind `head`: each has split from it, or is ahead
/// of it. A branch that cannot be read is left out.
fn forks(
    repo: &Repository,
    doc: &Doc,
    resolved: &ResolvedActor,
    local: &PublicKey,
    head: git::Oid,
) -> Result<Vec<ActorFork>, Error> {
    let default_branch = doc.project()?.default_branch().clone();
    let head = git::raw::Oid::from(head);
    let profile_at = |commit: git::raw::Oid| {
        Ok::<_, actor::Error>(match actor::read_profile(&repo.backend, commit.into())? {
            actor::ProfileFile::Read(read) => Some(*read),
            actor::ProfileFile::Unreadable | actor::ProfileFile::Missing => None,
        })
    };
    let fork = |did: Did, tip: git::raw::Oid| {
        if tip == head || repo.backend.graph_descendant_of(head, tip)? {
            return Ok(None);
        }
        let theirs = profile_at(tip)?;
        // Two versions that each merged the other split at several commits,
        // and none of them is where both started from.
        let split = match repo.backend.merge_bases(head, tip) {
            Ok(splits) if splits.len() == 1 => Some(splits[0]),
            Ok(_) => None,
            Err(e) => {
                log::warn!("Not able to find where {tip} split from {head}: {e}");
                None
            }
        };
        // A newer profile is read without the fields this version does not
        // know, which is not what the two versions started from.
        let base = match split {
            Some(split) => profile_at(split)?.filter(|read| !read.newer),
            None => None,
        };
        // With no commit to count from, the other files are those that
        // differ from the version shown.
        let before = repo.backend.find_commit(split.unwrap_or(head))?.tree()?;
        let after = repo.backend.find_commit(tip)?.tree()?;
        let other_files = repo
            .backend
            .diff_tree_to_tree(Some(&before), Some(&after), None)?
            .deltas()
            .any(|delta| delta.new_file().path() != Some(Path::new(PROFILE_PATH)));
        let changes = match (&base, &theirs) {
            (Some(base), Some(theirs)) => {
                Some(actor::profile_changes(&base.profile, &theirs.profile)?)
            }
            _ => None,
        };

        Ok::<_, actor::Error>(Some(ActorFork {
            did,
            head: tip.into(),
            profile_newer: theirs.as_ref().is_some_and(|read| read.newer),
            profile: theirs.map(|read| read.profile),
            base: base.map(|read| read.profile),
            changes,
            other_files,
        }))
    };
    let mut forks = Vec::new();
    let others = resolved
        .keys
        .iter()
        .filter(|key| key.controller && *key.did != *local);

    for key in others {
        let branch = git::refs::storage::branch_of(&key.did, &default_branch);
        let Ok(tip) = repo.backend.refname_to_id(branch.as_str()) else {
            continue;
        };
        match fork(key.did, tip) {
            Ok(fork) => forks.extend(fork),
            Err(e) => log::warn!(
                "Not able to read the profile of {} on {}: {e}",
                repo.id,
                key.did
            ),
        }
    }
    Ok(forks)
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
            let effect = effect(doc, resolved, &open.doc, open.resolved.as_ref(), &key_of);
            ActorRevision {
                id: open.id,
                author: open.author,
                created_at: open.time,
                added: effect.added,
                removed: effect.removed,
                threshold: effect.threshold,
                accepted: voters(doc, open.accepted),
                rejected: voters(doc, open.rejected),
                unreadable: effect.unreadable,
                state: actor::RevisionState::Open,
            }
        })
        .collect();
    Ok(pending)
}

/// What a change to the identity does, as Desktop shows it.
struct Effect {
    added: Vec<ActorKey>,
    removed: Vec<Did>,
    threshold: Option<usize>,
    unreadable: bool,
}

/// What the change from `doc`, which gives the actor `resolved`, to
/// `proposed_doc` does; `proposed` is the actor that one gives, if any.
fn effect(
    doc: &Doc,
    resolved: &ResolvedActor,
    proposed_doc: &Doc,
    proposed: Option<&ResolvedActor>,
    key_of: impl Fn(&actor::ResolvedKey) -> ActorKey,
) -> Effect {
    let (added, removed) = match proposed {
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
    // A keys entry the change edits without adding or removing that key is
    // one Desktop does not show.
    let shown = added
        .iter()
        .map(|key: &ActorKey| key.did)
        .chain(removed.iter().copied())
        .map(|did| did.to_string())
        .collect::<Vec<_>>();
    let hidden = actor::changed_key_entries(doc, proposed_doc)
        .iter()
        .any(|entry| !shown.contains(entry));

    Effect {
        added,
        removed,
        threshold: (proposed_doc.threshold() < doc.threshold()).then_some(proposed_doc.threshold()),
        unreadable: proposed.is_none_or(|proposed| proposed.payload_newer)
            || !actor::changes_only_keys(doc, proposed_doc)
            || hidden,
    }
}

/// Those of `dids` that vote on a change to `doc`.
fn voters(doc: &Doc, dids: Vec<Did>) -> Vec<Did> {
    dids.into_iter()
        .filter(|did| doc.is_delegate(did))
        .collect()
}

/// A change `closed_revisions` gives, as Desktop shows it.
fn closed_revision(
    closed: actor::ClosedIdentityRevision,
    key_of: impl Fn(&actor::ResolvedKey) -> ActorKey,
) -> ActorRevision {
    let (effect, voting) = match &closed.before {
        Some((doc, Some(resolved))) => (
            effect(doc, resolved, &closed.doc, closed.after.as_ref(), &key_of),
            doc,
        ),
        // What it was proposed on gave no actor, so what it did to one cannot
        // be told.
        Some((doc, None)) => (
            Effect {
                added: Vec::new(),
                removed: Vec::new(),
                threshold: None,
                unreadable: true,
            },
            doc,
        ),
        // The first version adds the keys the actor starts with, and its own
        // controllers are the ones that made it.
        None => (
            Effect {
                added: closed
                    .after
                    .iter()
                    .flat_map(|actor| &actor.keys)
                    .map(&key_of)
                    .collect(),
                removed: Vec::new(),
                threshold: None,
                unreadable: closed
                    .after
                    .as_ref()
                    .is_none_or(|actor| actor.payload_newer),
            },
            &closed.doc,
        ),
    };

    ActorRevision {
        id: closed.id,
        author: closed.author,
        created_at: closed.time,
        added: effect.added,
        removed: effect.removed,
        threshold: effect.threshold,
        accepted: voters(voting, closed.accepted),
        rejected: voters(voting, closed.rejected),
        unreadable: effect.unreadable,
        state: closed.state,
    }
}

/// The profile fields in which `commit` differs from the first version it
/// was saved over; `None` if either holds a profile that cannot be read in
/// full.
fn edited_fields(
    repo: &Repository,
    commit: &git::raw::Commit,
) -> Result<Option<Vec<&'static str>>, git::raw::Error> {
    // `None` if the profile cannot be read in full, `Some(None)` if the
    // version has no profile file.
    let whole = |commit: &git::raw::Commit| {
        Ok::<_, git::raw::Error>(
            match actor::read_profile(&repo.backend, commit.id().into())? {
                actor::ProfileFile::Read(read) if !read.newer => Some(Some(read.profile)),
                actor::ProfileFile::Missing => Some(None),
                _ => None,
            },
        )
    };
    let Some(after) = whole(commit)? else {
        return Ok(None);
    };
    let Some(parent) = commit.parents().next() else {
        return Ok(Some(actor::changed_fields(None, after.as_ref())));
    };
    let Some(before) = whole(&parent)? else {
        return Ok(None);
    };
    let mut fields = actor::changed_fields(before.as_ref(), after.as_ref());

    // A picture saved again under the name it had.
    let (old, new) = (parent.tree()?, commit.tree()?);
    let pictures = after
        .iter()
        .flat_map(|after| [("avatar", &after.avatar), ("banner", &after.banner)]);
    for (field, path) in pictures {
        let file = |tree: &git::raw::Tree| {
            let path = path.as_deref().filter(|path| !path.contains(':'))?;
            Some(tree.get_path(Path::new(path)).ok()?.id())
        };
        if !fields.contains(&field) && file(&old) != file(&new) {
            fields.push(field);
        }
    }

    Ok(Some(fields))
}

/// The version `oid` of the profile in `repo`; `head` is the commit of the
/// profile `actor` shows.
fn profile_edit(
    repo: &Repository,
    oid: git::raw::Oid,
    head: Option<git::raw::Oid>,
) -> Result<ProfileEdit, Error> {
    let commit = repo.backend.find_commit(oid)?;
    // A version that cannot be read is still one that was saved.
    let fields = edited_fields(repo, &commit).unwrap_or_else(|e| {
        log::warn!("Not able to read the version {oid} of {}: {e}", repo.id);
        None
    });
    // Storage writes a commit as `alias@key`.
    let author = commit
        .author()
        .email()
        .ok()
        .and_then(|email| email.rsplit_once('@'))
        .and_then(|(_, key)| key.parse::<PublicKey>().ok())
        .map(Did::from);
    // A version whose place cannot be told is not said to be the profile's.
    let live = head.is_some_and(|head| {
        head == oid
            || repo
                .backend
                .graph_descendant_of(head, oid)
                .unwrap_or_else(|e| {
                    log::warn!("Not able to place the version {oid} of {}: {e}", repo.id);
                    false
                })
    });

    Ok(ProfileEdit {
        commit: oid.into(),
        parents: commit.parent_ids().map(Into::into).collect(),
        saved_at: commit.time().seconds(),
        author,
        fields: fields.map(|fields| fields.into_iter().map(str::to_owned).collect()),
        live,
    })
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

/// The repository of an actor, its identity history, and what that resolves
/// to.
type Bound = (Repository, Vec<IdentityDocRevision>, ResolvedActor);

/// The one live individual actor that binds the local key. `None` if there
/// is none, `Ambiguous` if there are several. `ActorNewer` if there is none
/// and the key is bound by an actor that cannot be told to be one, or
/// controls one whose keys cannot be read, so that the key is not given a
/// second actor. A key such an actor binds without control is not found:
/// nothing readable ties it to the actor. Scans every repository.
fn bound<A: Actor + ?Sized>(actor: &A) -> Result<Option<Bound>, Error> {
    let (mut found, unsure) = bindings(actor)?;

    match found.len() {
        0 => unsure.map_or(Ok(None), |rid| Err(actor::Error::ActorNewer(rid).into())),
        1 => Ok(Some(found.remove(0))),
        _ => {
            Err(actor::Error::Ambiguous(found.iter().map(|(repo, _, _)| repo.id).collect()).into())
        }
    }
}

/// Every live individual actor that binds the local key, and an actor that
/// may bind it but cannot be read well enough to tell, if there is one.
/// Scans every repository.
fn bindings<A: Actor + ?Sized>(actor: &A) -> Result<(Vec<Bound>, Option<RepoId>), Error> {
    let profile = actor.profile();
    let did = profile.did();
    let mut found = Vec::new();
    let mut unsure = None;

    for (rid, doc) in repositories(&profile.storage)? {
        // Only a repository whose current document names the key has
        // its history walked.
        let Some(payload) = ActorPayload::of(&doc) else {
            if ActorPayload::marks(&doc) {
                log::warn!(
                    "Skipping {rid} while looking for the actor: its actor payload is not valid"
                );
            }
            continue;
        };
        if !payload.keys.contains_key(&did) && !doc.is_delegate(&did) {
            continue;
        }
        let Some((repo, history, resolved)) = resolved_at(&profile.storage, rid) else {
            continue;
        };
        let bound = resolved.bound_keys().any(|bound| bound == did);
        // Where the keys cannot be read, control is all that shows the key
        // is the actor's.
        if resolved.unsure && (bound || resolved.keys.iter().any(|key| key.did == did)) {
            unsure = Some(rid);
        } else if bound && resolved.is_live_individual() {
            found.push((repo, history, resolved));
        }
    }

    Ok((found, unsure))
}

/// The profile of the actor in `repo` as it shows in place of an alias, if it
/// has one to show, see `Actor::key_profiles`. Why it has none goes to the
/// log: at debug level where that is an ordinary state, as a warning where a
/// read failed.
fn shown_profile(repo: &Repository) -> Option<ShownProfile> {
    let rid = repo.id;
    let skipped = |why: &str| log::debug!("Not showing the profile of {rid}: {why}");

    let head = match repo.head() {
        Ok((_, head)) => head,
        Err(RepositoryError::Quorum(_)) => {
            skipped("it has no canonical branch yet");
            return None;
        }
        Err(e) => {
            log::warn!("Not able to find the canonical branch of {rid}: {e}");
            return None;
        }
    };
    let shown = actor::read_profile(&repo.backend, head).and_then(|file| match file {
        actor::ProfileFile::Read(read) if read.valid => {
            actor::with_shown_pictures(&repo.backend, head, read.profile).map(Some)
        }
        actor::ProfileFile::Read(_) => {
            skipped("a save would refuse it");
            Ok(None)
        }
        actor::ProfileFile::Unreadable => {
            skipped("the file cannot be read");
            Ok(None)
        }
        actor::ProfileFile::Missing => {
            skipped("there is no file");
            Ok(None)
        }
    });

    match shown {
        Ok(profile) => profile.map(|profile| ShownProfile { rid, head, profile }),
        Err(e) => {
            log::warn!("Not able to read the profile of {rid}: {e}");
            None
        }
    }
}

/// The actor that the repository at `rid` resolves to, with its repository
/// and identity history. `None` if it resolves to none, or cannot be read,
/// which is logged: one repository that cannot be read must not hide the rest.
fn resolved_at(storage: &radicle::storage::git::Storage, rid: RepoId) -> Option<Bound> {
    let loaded = storage
        .repository(rid)
        .map_err(Error::from)
        .and_then(|repo| Ok((actor::identity_history(&repo)?, repo)));
    let (history, repo) = match loaded {
        Ok(loaded) => loaded,
        Err(e) => {
            log::warn!("Skipping {rid} while looking for the actor: {e}");
            return None;
        }
    };
    let resolved = actor::resolve(rid, &history)?;

    Some((repo, history, resolved))
}

/// The actor at `rid` among those that bind the local key, and the others.
/// `NotBound` if it is not one of them. Scans every repository.
fn binding_at<A: Actor + ?Sized>(actor: &A, rid: RepoId) -> Result<(Bound, Vec<Bound>), Error> {
    let (mut found, _) = bindings(actor)?;
    let at = found
        .iter()
        .position(|(repo, _, _)| repo.id == rid)
        .ok_or(actor::Error::NotBound(rid))?;

    Ok((found.remove(at), found))
}

/// What `actor` finds, with its repository. `NotFound` if there is none.
/// Scans every repository.
fn current<A: Actor + ?Sized>(actor: &A) -> Result<(ActorInfo, Repository), Error> {
    let ActorWithHistory { current, repo, .. } = actor_with_history(actor)?;

    Ok((current, repo))
}

/// The actor after applying `vote` to the open identity change `id`, once
/// `check` passes, and publishing. `RevisionNotFound` if no open change has
/// `id`. `Moved` if the change is not as `held` wants it afterwards: by then
/// the vote is written, signed and announced, and counts for nothing. Scans
/// every repository.
fn vote<A: Actor + ?Sized>(
    actor: &A,
    id: git::Oid,
    opts: CobOptions,
    check: impl FnOnce(&ActorInfo, &ActorRevision) -> Result<(), Error>,
    cast: impl FnOnce(&mut IdentityMut<'_, '_, Repository, Signer>) -> Result<EntryId, identity::Error>,
    held: impl FnOnce(&identity::Revision) -> bool,
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
    let actor = publish_identity(actor, &repo, opts)?;
    landed(&repo, &id, held)?;

    Ok(actor)
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
/// checks `may_change_identity`. `NotFound` if there is none. Scans every
/// repository.
fn actor_with_history<A: Actor + ?Sized>(actor: &A) -> Result<ActorWithHistory, Error> {
    let (repo, history, resolved) = bound(actor)?.ok_or(actor::Error::NotFound)?;
    // The actor as this history gives it, so that what the caller checks and
    // what it builds on are one state.
    let current = actor_info(actor, &repo, &history, resolved)?;

    Ok(ActorWithHistory {
        current,
        repo,
        history,
    })
}

/// An actor the local key may join.
struct Joinable {
    repo: Repository,
    history: Vec<IdentityDocRevision>,
    resolved: ResolvedActor,
}

/// The actor at `rid`, if the local key may join it: see `joinable_actor`
/// for the refusals.
fn joinable<A: Actor + ?Sized>(actor: &A, rid: RepoId) -> Result<Joinable, Error> {
    if let Some(existing) = actor.actor()? {
        return Err(actor::Error::Exists(existing.rid).into());
    }
    let radicle_profile = actor.profile();
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
    let resolved = actor::resolve(rid, &history)
        .filter(ResolvedActor::is_live_individual)
        .ok_or(actor::Error::NotJoinable(rid))?;
    // The node asks for the head before it fetches, and gives up on a copy
    // that has none.
    if repo.head().is_err() {
        return Err(actor::Error::CopyStuck(rid).into());
    }

    Ok(Joinable {
        repo,
        history,
        resolved,
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
