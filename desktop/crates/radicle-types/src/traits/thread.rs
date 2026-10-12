use std::fs;

use radicle::Node;
use radicle::cob;
use radicle::crypto::Signer;
use radicle::git;
use radicle::identity;
use radicle::node::Handle;
use radicle::storage::ReadRepository;
use radicle::storage::ReadStorage;

use crate::cobs;
use crate::error::Error;
use crate::traits::Profile;

pub const MAX_EMBED_SIZE: usize = 10_485_760;

pub trait Thread: Profile {
    fn get_embed(
        &self,
        rid: identity::RepoId,
        name: Option<String>,
        oid: git::Oid,
    ) -> Result<cobs::EmbedWithMimeType, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let blob = repo.blob(oid)?;
        let content = blob.content();
        let mime_type = match infer::get(content).map(|i| i.mime_type().to_string()) {
            Some(mime_type) => Some(mime_type),
            None if name.is_some() => {
                let filename = name.unwrap();
                mime_infer::from_path(&filename)
                    .first()
                    .map(|m| m.as_ref().to_string())
            }
            _ => None,
        };

        Ok::<_, Error>(cobs::EmbedWithMimeType {
            content: content.to_vec(),
            mime_type,
        })
    }

    fn save_embed_to_disk(
        &self,
        rid: identity::RepoId,
        oid: git::Oid,
        path: std::path::PathBuf,
    ) -> Result<(), Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let blob = repo.blob(oid)?;
        fs::write(path, blob.content())?;

        Ok::<_, Error>(())
    }

    fn save_embed_by_path(
        &self,
        rid: identity::RepoId,
        path: std::path::PathBuf,
    ) -> Result<git::Oid, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let bytes = fs::read(path.clone())?;
        let file_size = bytes.len();
        if file_size > MAX_EMBED_SIZE {
            return Err(Error::FileTooLarge(file_size));
        }
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("embed");
        let embed = radicle::cob::Embed::<git::Oid>::store(name, &bytes, &repo.backend)?;

        Ok(embed.oid())
    }

    fn save_embed_by_bytes(
        &self,
        rid: identity::RepoId,
        name: &str,
        bytes: &[u8],
    ) -> Result<git::Oid, Error> {
        let file_size = bytes.len();
        if file_size > MAX_EMBED_SIZE {
            return Err(Error::FileTooLarge(file_size));
        }
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let embed = radicle::cob::Embed::<git::Oid>::store(name, bytes, &repo.backend)?;

        Ok(embed.oid())
    }

    fn create_issue_comment(
        &self,
        rid: identity::RepoId,
        new: cobs::thread::NewIssueComment,
        opts: cobs::CobOptions,
    ) -> Result<cobs::thread::Comment<cobs::Never>, Error> {
        let profile = self.profile();
        let aliases = &profile.aliases();
        let mut node = Node::new(profile.home().socket_from_env());
        let signer = profile.signer()?;
        let repo = profile.storage.repository(rid)?;
        let mut issues = profile.issues_mut(&repo, &signer)?;
        let mut issue = issues.get_mut(&new.id.into())?;
        let id = new.reply_to.unwrap_or_else(|| {
            let (root_id, _) = issue.root();
            *root_id
        });
        let n = new.clone();
        let oid = issue.comment(
            n.body,
            id,
            n.embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
        )?;

        if opts.announce()
            && let Err(e) = node.announce_refs_for(rid, [profile.public_key])
        {
            log::error!("Not able to announce changes: {}", e)
        }

        Ok(cobs::thread::Comment::<cobs::Never>::new(
            oid,
            cob::thread::Comment::new(
                *signer.public_key(),
                new.body,
                id.into(),
                None,
                new.embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                cob::Timestamp::from_secs(radicle_localtime::LocalTime::now().as_secs()),
            ),
            aliases,
        ))
    }

    fn create_patch_comment(
        &self,
        rid: identity::RepoId,
        new: cobs::thread::NewPatchComment,
        opts: cobs::CobOptions,
    ) -> Result<cobs::thread::Comment<cobs::thread::CodeLocation>, Error> {
        let profile = self.profile();
        let aliases = &profile.aliases();
        let mut node = Node::new(profile.home().socket_from_env());
        let signer = profile.signer()?;
        let repo = profile.storage.repository(rid)?;
        let mut patches = profile.patches_mut(&repo, &signer)?;
        let mut patch = patches.get_mut(&new.id.into())?;
        let n = new.clone();
        let oid = patch.comment(
            new.revision.into(),
            n.body,
            n.reply_to,
            n.location.map(|l| l.into()),
            n.embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
        )?;

        if opts.announce()
            && let Err(e) = node.announce_refs_for(rid, [profile.public_key])
        {
            log::error!("Not able to announce changes: {}", e)
        }

        Ok(cobs::thread::Comment::<cobs::thread::CodeLocation>::new(
            oid,
            cob::thread::Comment::new(
                *signer.public_key(),
                new.body,
                new.reply_to,
                new.location.map(|l| l.into()),
                new.embeds.into_iter().map(Into::into).collect::<Vec<_>>(),
                cob::Timestamp::from_secs(radicle_localtime::LocalTime::now().as_secs()),
            ),
            aliases,
        ))
    }
}
