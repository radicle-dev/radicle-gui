use std::collections::BTreeSet;

use radicle::cob::Title;
use radicle::issue::cache::Issues as _;
use radicle::node::Handle;
use radicle::storage::ReadStorage;
use radicle::{Node, git, identity};

use crate::cobs;
use crate::error::Error;
use crate::traits::Profile;

pub trait Issues: Profile {
    fn issue_by_id(
        &self,
        rid: identity::RepoId,
        id: git::Oid,
    ) -> Result<Option<cobs::issue::Issue>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let issues = profile.issues(&repo)?;
        let issue = issues.get(&id.into())?;

        let aliases = &profile.aliases();
        let issue = issue.map(|issue| cobs::issue::Issue::new(&id.into(), &issue, aliases));

        Ok::<_, Error>(issue)
    }

    fn comment_threads_by_issue_id(
        &self,
        rid: identity::RepoId,
        id: git::Oid,
    ) -> Result<Option<Vec<cobs::thread::Thread>>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let issues = profile.issues(&repo)?;
        let issue = issues.get(&id.into())?;

        let aliases = &profile.aliases();
        let comments = issue.map(|issue| {
            issue
                .replies()
                // Filter out replies that aren't top level replies
                .filter(|c| {
                    let Some(oid) = c.1.reply_to() else {
                        return false;
                    };

                    oid == id
                })
                .map(|(oid, c)| {
                    let root = cobs::thread::Comment::<cobs::Never>::new(*oid, c.clone(), aliases);
                    let replies = issue
                        .replies_to(oid)
                        .map(|(oid, c)| {
                            cobs::thread::Comment::<cobs::Never>::new(*oid, c.clone(), aliases)
                        })
                        .collect::<Vec<_>>();

                    cobs::thread::Thread { root, replies }
                })
                .collect::<Vec<_>>()
        });

        Ok::<_, Error>(comments)
    }
}

pub trait IssuesMut: Profile {
    fn rebuild_issue_cache(
        &self,
        rid: identity::RepoId,
        on_event: impl Fn(cobs::CacheEvent) -> Result<(), Error>,
    ) -> Result<(), Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let mut issues = profile.issues_mut(&repo, &signer)?;
        on_event(cobs::CacheEvent::Started { rid })?;
        issues.write_all(|result, progress| {
            match result {
                Ok((id, _)) => {
                    if on_event(cobs::CacheEvent::Progress {
                        rid,
                        oid: **id,
                        current: progress.current(),
                        total: progress.total(),
                    })
                    .is_err()
                    {
                        log::error!("Failed to send progress");
                    }
                }
                Err(err) => log::warn!("Failed to retrieve issue: {err}"),
            };
            std::ops::ControlFlow::Continue(())
        })?;
        on_event(cobs::CacheEvent::Finished { rid })?;

        Ok(())
    }

    fn create_issue(
        &self,
        rid: identity::RepoId,
        new: cobs::issue::NewIssue,
        opts: cobs::CobOptions,
    ) -> Result<cobs::issue::Issue, Error> {
        let profile = self.profile();
        let mut node = Node::new(profile.home().socket_from_env());
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut issues = profile.issues_mut(&repo, &signer)?;
        let title = Title::try_from(new.title)?;
        let issue = issues.create(
            title,
            new.description,
            &new.labels,
            &new.assignees,
            new.embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
        )?;

        if opts.announce()
            && let Err(e) = node.announce_refs_for(rid, [profile.public_key])
        {
            log::error!("Not able to announce changes: {}", e)
        }

        Ok::<_, Error>(cobs::issue::Issue::new(issue.id(), &issue, &aliases))
    }

    fn edit_issue(
        &self,
        rid: identity::RepoId,
        cob_id: git::Oid,
        action: cobs::issue::Action,
        opts: cobs::CobOptions,
    ) -> Result<cobs::issue::Issue, Error> {
        let profile = self.profile();
        let mut node = Node::new(profile.home().socket_from_env());
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;
        let aliases = profile.aliases();
        let mut issues = profile.issues_mut(&repo, &signer)?;
        let mut issue = issues.get_mut(&cob_id.into())?;

        match action {
            cobs::issue::Action::Lifecycle { state } => {
                issue.lifecycle(state.into())?;
            }
            cobs::issue::Action::Assign { assignees } => {
                issue.assign(assignees.iter().map(|a| *a.did()).collect::<BTreeSet<_>>())?;
            }
            cobs::issue::Action::Label { labels } => {
                issue.label(labels)?;
            }
            cobs::issue::Action::CommentReact {
                id,
                reaction,
                active,
            } => {
                issue.react(id, reaction, active)?;
            }
            cobs::issue::Action::CommentRedact { id } => {
                issue.redact_comment(id)?;
            }
            cobs::issue::Action::Comment {
                body,
                reply_to,
                embeds,
            } => {
                issue.comment(
                    body,
                    reply_to.unwrap_or(cob_id),
                    embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                )?;
            }
            cobs::issue::Action::CommentEdit { id, body, embeds } => {
                issue.edit_comment(
                    id,
                    body,
                    embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                )?;
            }
            cobs::issue::Action::Edit { title } => {
                issue.edit(Title::try_from(title)?)?;
            }
        }

        if opts.announce()
            && let Err(e) = node.announce_refs_for(rid, [profile.public_key])
        {
            log::error!("Not able to announce changes: {}", e)
        }

        Ok::<_, Error>(cobs::issue::Issue::new(issue.id(), &issue, &aliases))
    }

    /// Remove an issue COB. Equivalent to `rad issue delete`.
    ///
    /// Only the COB ref under our own namespace is dropped. On an issue we did
    /// not author we hold no such ref, so this returns `Ok` having deleted
    /// nothing — while still evicting the cache entry, hiding the issue until
    /// the next rebuild. Callers must restrict this to our own issues.
    fn delete_issue(
        &self,
        rid: identity::RepoId,
        cob_id: git::Oid,
        opts: cobs::CobOptions,
    ) -> Result<(), Error> {
        let profile = self.profile();
        let mut node = Node::new(profile.home().socket_from_env());
        let repo = profile.storage.repository(rid)?;
        let signer = profile.signer()?;

        // Remove via the cache-backed store so the issue is dropped from both
        // the git refs and the COB cache that listings read from; otherwise the
        // deleted issue keeps showing up in the issue list.
        let mut issues = profile.issues_mut(&repo, &signer)?;
        issues.remove(&cob_id.into())?;
        drop(issues);

        if opts.announce()
            && let Err(e) = node.announce_refs_for(rid, [profile.public_key])
        {
            log::error!("Not able to announce changes: {}", e)
        }

        Ok(())
    }
}
