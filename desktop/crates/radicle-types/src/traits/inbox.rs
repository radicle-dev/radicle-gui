use radicle::identity;
use radicle::issue::cache::Issues;
use radicle::node;
use radicle::patch::cache::Patches;
use radicle::storage::{ReadRepository, ReadStorage};

use crate::domain::inbox::models::notification::{self, RepoGroupByItem};
use crate::domain::inbox::service::Service;
use crate::domain::inbox::traits::InboxService;
use crate::error::Error;
use crate::outbound::sqlite::Sqlite;

use crate::traits::Profile;

pub trait Inbox: Profile {
    fn list_notifications(
        &self,
        sqlite_service: &Service<Sqlite>,
        params: notification::RepoGroupParams,
    ) -> Result<notification::NotificationsByRepoList, Error> {
        let profile = &self.profile();
        let aliases = profile.aliases();
        let repos_with_groups = sqlite_service.repo_group(params.clone())?;

        let mut repo_counts = std::collections::HashMap::new();
        for (repo_id, count) in (sqlite_service.counts_by_repo()?).flatten() {
            repo_counts.insert(repo_id, count);
        }

        let take = if params.all.unwrap_or(false) {
            usize::MAX
        } else {
            params.take.unwrap_or(20)
        };

        let mut grouped_repos = std::collections::HashMap::new();
        for (repo_id, group) in repos_with_groups {
            grouped_repos
                .entry(repo_id)
                .or_insert_with(Vec::new)
                .extend(group);
        }

        let mut result = Vec::new();

        for (repo_id, all) in grouped_repos {
            let repo = match profile.storage.repository(repo_id) {
                Ok(r) => r,
                Err(e) => {
                    log::error!("Failed to open repository {}: {}", repo_id, e);
                    continue;
                }
            };

            let name = match repo.identity_doc() {
                Ok(identity::DocAt { doc, .. }) => match doc.project() {
                    Ok(project) => project.name().to_string(),
                    Err(_) => format!("Unknown project in {}", repo_id),
                },
                Err(_) => format!("Unknown project in {}", repo_id),
            };

            let patches = match profile.patches(&repo) {
                Ok(p) => p,
                Err(e) => {
                    log::error!("Failed to get patches for {}: {}", repo_id, e);
                    continue;
                }
            };
            let issues = match profile.issues(&repo) {
                Ok(i) => i,
                Err(e) => {
                    log::error!("Failed to get issues for {}: {}", repo_id, e);
                    continue;
                }
            };

            let content = all
                .into_iter()
                .take(take)
                .map(|(qualified, n)| {
                    n.into_iter()
                        .filter_map(|s| {
                            let update: notification::RefUpdate =
                                (qualified.clone().into_refstring(), s.new, s.old).into();
                            let update: radicle::storage::RefUpdate = update.into();
                            let kind =
                                node::notifications::NotificationKind::try_from(qualified.clone())
                                    .ok()?;

                            match kind {
                                node::notifications::NotificationKind::Cob { ref typed_id } => {
                                    if typed_id.is_patch() {
                                        let actions = notification::actions(
                                            typed_id.type_name.clone(),
                                            typed_id.id,
                                            update.old(),
                                            update.new(),
                                            &repo,
                                            &aliases,
                                        )
                                        .unwrap_or_default();

                                        match patches.get(&typed_id.id) {
                                            Ok(Some(p)) => {
                                                Some(notification::NotificationItem::Patch(
                                                    notification::Patch {
                                                        row_id: s.row_id,
                                                        id: typed_id.id,
                                                        update: update.into(),
                                                        timestamp: s.timestamp,
                                                        title: p.title().to_string(),
                                                        status: (p.state().clone()).into(),
                                                        actions,
                                                        repo_id: Some(repo_id),
                                                    },
                                                ))
                                            }
                                            Ok(None) => {
                                                log::error!("No patch found");
                                                None
                                            }
                                            Err(e) => {
                                                log::error!("{}", e);
                                                None
                                            }
                                        }
                                    } else if typed_id.is_issue() {
                                        let actions = notification::actions(
                                            typed_id.type_name.clone(),
                                            typed_id.id,
                                            update.old(),
                                            update.new(),
                                            &repo,
                                            &aliases,
                                        )
                                        .unwrap_or_default();

                                        match issues.get(&typed_id.id) {
                                            Ok(Some(i)) => {
                                                Some(notification::NotificationItem::Issue(
                                                    notification::Issue {
                                                        row_id: s.row_id,
                                                        id: typed_id.id,
                                                        update: update.into(),
                                                        timestamp: s.timestamp,
                                                        title: i.title().to_string(),
                                                        status: (*i.state()).into(),
                                                        actions,
                                                        repo_id: Some(repo_id),
                                                    },
                                                ))
                                            }
                                            Ok(None) => {
                                                log::error!("No issue found");
                                                None
                                            }
                                            Err(e) => {
                                                log::error!("{}", e);
                                                None
                                            }
                                        }
                                    } else {
                                        None
                                    }
                                }
                                _ => None,
                            }
                        })
                        .collect::<Vec<_>>()
                })
                .filter(|v| !v.is_empty())
                .collect::<RepoGroupByItem>();

            if !content.is_empty() {
                let count = repo_counts
                    .get(&repo_id)
                    .copied()
                    .unwrap_or_else(|| content.iter().map(|items| items.len()).sum());

                result.push(notification::NotificationsByRepo {
                    rid: repo_id,
                    name,
                    notifications: content,
                    count,
                });
            }
        }

        Ok(result)
    }

    fn notification_count(&self, inbox: &Service<Sqlite>) -> Result<usize, Error> {
        inbox.notification_count().map_err(Error::from)
    }

    fn clear_notifications(
        &self,
        params: notification::SetStatusNotifications,
    ) -> Result<(), Error> {
        let profile = &self.profile();
        let mut notifications = profile.notifications_mut()?;
        match params {
            notification::SetStatusNotifications::Ids(ids) => notifications.clear(&ids)?,
            notification::SetStatusNotifications::Repo(repo) => {
                notifications.clear_by_repo(&repo)?
            }
            notification::SetStatusNotifications::All => notifications.clear_all()?,
        };

        Ok(())
    }
}
