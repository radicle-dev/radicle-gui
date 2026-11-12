//! The profile file of an actor repository: its limits, how its text is
//! cleaned, and how it is read and written.

use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization as _;

use radicle::git;

use super::Error;

/// Where the profile lives, relative to the root of the default branch.
pub const PROFILE_PATH: &str = ".radicle/profile.json";
const PROFILE_VERSION: u32 = 1;
/// The limits on the profile file's strings, in characters, and on its links.
const MAX_STRING: usize = 255;
const MAX_LABEL: usize = 64;
const MAX_LINKS: usize = 16;
/// The most bytes a profile file is read with; a valid one is a few hundred.
const MAX_PROFILE_BYTES: usize = 64 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(deny_unknown_fields)]
#[ts(export_to = "actor/")]
pub struct ProfileLink {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub label: Option<String>,
}

/// The contents of `.radicle/profile.json`. A file of `PROFILE_VERSION` must
/// match the schema exactly; a newer one is read for its known fields.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "actor/")]
pub struct ActorProfile {
    pub version: u32,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub full_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pronouns: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bio: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub timezone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub banner: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<ProfileLink>,
}

const PROFILE_FIELDS: &[&str] = &[
    "version",
    "displayName",
    "fullName",
    "pronouns",
    "bio",
    "location",
    "timezone",
    "avatar",
    "banner",
    "links",
];
const LINK_FIELDS: &[&str] = &["url", "label"];

/// Text as it is displayed or compared: NFC, trimmed, without control or
/// invisible characters.
fn clean_text(value: &str) -> String {
    clean(value, |_| false)
}

/// Text of several lines: cleaned as `clean_text` does, except that its line
/// breaks stay.
fn clean_lines(value: &str) -> String {
    clean(value, |c| c == '\n')
}

fn clean(value: &str, kept: impl Fn(char) -> bool) -> String {
    value
        .nfc()
        .filter(|c| kept(*c) || (!c.is_control() && !is_invisible(*c)))
        .collect::<String>()
        .trim()
        .to_string()
}

/// Characters that do not show and can make one name look like another:
/// bidirectional marks, zero-width characters and line separators.
fn is_invisible(c: char) -> bool {
    matches!(
        c,
        '\u{061C}'
            | '\u{200B}'..='\u{200F}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'
            | '\u{2066}'..='\u{2069}'
            | '\u{FEFF}'
    )
}

const LINK_SCHEMES: &[&str] = &["https", "http", "mailto", "rad"];
const IMAGE_SCHEMES: &[&str] = &["https", "http"];

/// A web URL, or a path relative to the repository root. A path may not hold
/// `%`, since a browser decodes `%2e%2e` to `..`.
fn is_image_ref(value: &str) -> bool {
    if value.contains(':') {
        return has_scheme(value, IMAGE_SCHEMES);
    }
    !value.contains('\\')
        && !value.contains('%')
        && !value.starts_with('/')
        && !value.split('/').any(|part| part == "..")
}

fn has_scheme(url: &str, schemes: &[&str]) -> bool {
    url.split_once(':').is_some_and(|(scheme, _)| {
        schemes
            .iter()
            .any(|allowed| scheme.eq_ignore_ascii_case(allowed))
    })
}

impl ActorProfile {
    /// The first field that breaks a limit, as a message for the form.
    pub fn validate(&self) -> Result<(), String> {
        let display_name = self.display_name.trim();
        if display_name.is_empty() {
            return Err("display name is required".to_string());
        }
        let strings = [
            ("display name", Some(&self.display_name)),
            ("full name", self.full_name.as_ref()),
            ("pronouns", self.pronouns.as_ref()),
            ("bio", self.bio.as_ref()),
            ("location", self.location.as_ref()),
            ("time zone", self.timezone.as_ref()),
            ("avatar", self.avatar.as_ref()),
            ("banner", self.banner.as_ref()),
        ];
        for (field, value) in strings {
            if value.is_some_and(|v| v.chars().count() > MAX_STRING) {
                return Err(format!("{field} cannot exceed {MAX_STRING} characters"));
            }
        }
        // Other clients render these as links and images, so a scheme that
        // runs code or reads local files never gets signed.
        for (field, value) in [("avatar", &self.avatar), ("banner", &self.banner)] {
            if value.as_ref().is_some_and(|image| !is_image_ref(image)) {
                return Err(format!(
                    "{field} must be a path in the repository or a web URL"
                ));
            }
        }
        if self.links.len() > MAX_LINKS {
            return Err(format!("at most {MAX_LINKS} links are allowed"));
        }
        for link in &self.links {
            let length = link.url.chars().count();
            if length == 0 || length > MAX_STRING {
                return Err(format!("a link must be 1 to {MAX_STRING} characters"));
            }
            if !has_scheme(&link.url, LINK_SCHEMES) {
                return Err("a link must be a web URL, a mailto: address or a rad: URI".to_string());
            }
            if link
                .label
                .as_ref()
                .is_some_and(|l| l.chars().count() > MAX_LABEL)
            {
                return Err(format!("a link label cannot exceed {MAX_LABEL} characters"));
            }
        }
        Ok(())
    }

    /// The file as written to the repository: cleaned and trimmed, empty
    /// fields dropped.
    pub fn normalized(mut self) -> Self {
        self.version = PROFILE_VERSION;
        self.cleaned()
    }

    /// Every string cleaned with `clean_text`, the bio with `clean_lines`,
    /// empty optional fields dropped.
    fn cleaned(mut self) -> Self {
        fn clean(value: Option<String>) -> Option<String> {
            value.map(|v| clean_text(&v)).filter(|v| !v.is_empty())
        }
        self.display_name = clean_text(&self.display_name);
        self.full_name = clean(self.full_name);
        self.pronouns = clean(self.pronouns);
        self.bio = self.bio.map(|v| clean_lines(&v)).filter(|v| !v.is_empty());
        self.location = clean(self.location);
        self.timezone = clean(self.timezone);
        self.avatar = clean(self.avatar);
        self.banner = clean(self.banner);
        self.links = self
            .links
            .into_iter()
            .map(|link| ProfileLink {
                url: clean_text(&link.url),
                label: clean(link.label),
            })
            .filter(|link| !link.url.is_empty())
            .collect();
        self
    }

    /// The profile in a file of any version, see `ActorProfile`.
    fn from_json(bytes: &[u8]) -> Option<ReadProfile> {
        let mut value: serde_json::Value = serde_json::from_slice(bytes).ok()?;
        let version = value.get("version")?.as_u64()?;
        if version == 0 {
            return None;
        }
        let newer = version > u64::from(PROFILE_VERSION);
        if newer {
            let object = value.as_object_mut()?;
            object.retain(|key, _| PROFILE_FIELDS.contains(&key.as_str()));
            if let Some(links) = object.get_mut("links").and_then(|l| l.as_array_mut()) {
                for link in links.iter_mut().filter_map(|l| l.as_object_mut()) {
                    link.retain(|key, _| LINK_FIELDS.contains(&key.as_str()));
                }
            }
        }
        let profile: Self = serde_json::from_value(value).ok()?;

        Some(ReadProfile {
            profile: profile.cleaned(),
            newer,
        })
    }

    fn to_json(&self) -> Result<Vec<u8>, serde_json::Error> {
        let mut bytes = serde_json::to_vec_pretty(self)?;
        bytes.push(b'\n');
        Ok(bytes)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReadProfile {
    pub profile: ActorProfile,
    /// The file is newer than `PROFILE_VERSION`; writing it back would drop
    /// fields.
    pub newer: bool,
}

/// What a commit's tree holds at `PROFILE_PATH`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProfileFile {
    /// No file there.
    Missing,
    /// A file this version cannot read: not JSON, not its version's schema, or
    /// over `MAX_PROFILE_BYTES`. A save replaces it, so the user is told.
    Unreadable,
    Read(Box<ReadProfile>),
}

/// `parent`'s tree, or an empty one, with `profile` at `PROFILE_PATH`.
pub fn profile_tree<'a>(
    repo: &'a git::raw::Repository,
    parent: Option<&git::raw::Tree<'a>>,
    profile: &ActorProfile,
) -> Result<git::raw::Tree<'a>, Error> {
    let blob = repo.blob(&profile.to_json()?)?;
    let empty;
    let baseline = match parent {
        Some(tree) => tree,
        None => {
            empty = repo.find_tree(repo.treebuilder(None)?.write()?)?;
            &empty
        }
    };
    let tree = git2::build::TreeUpdateBuilder::new()
        .upsert(PROFILE_PATH, blob, git::raw::FileMode::Blob)
        .create_updated(repo, baseline)?;

    Ok(repo.find_tree(tree)?)
}

/// The profile in `commit`'s tree. A directory or a submodule at the path
/// counts as no file.
pub fn read_profile(
    repo: &git::raw::Repository,
    commit: git::Oid,
) -> Result<ProfileFile, git::raw::Error> {
    let tree = repo.find_commit(commit.into())?.tree()?;
    let Ok(entry) = tree.get_path(std::path::Path::new(PROFILE_PATH)) else {
        return Ok(ProfileFile::Missing);
    };
    if entry.kind() != Some(git::raw::ObjectType::Blob) {
        return Ok(ProfileFile::Missing);
    }
    // The size comes from the object's header, so a file over the limit is
    // never loaded.
    let (size, _) = repo.odb()?.read_header(entry.id())?;
    if size > MAX_PROFILE_BYTES {
        return Ok(ProfileFile::Unreadable);
    }
    let object = entry.to_object(repo)?;
    let Some(blob) = object.as_blob() else {
        return Ok(ProfileFile::Missing);
    };

    Ok(
        ActorProfile::from_json(blob.content()).map_or(ProfileFile::Unreadable, |read| {
            ProfileFile::Read(Box::new(read))
        }),
    )
}

#[cfg(test)]
mod tests;
