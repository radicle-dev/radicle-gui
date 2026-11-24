//! The profile file of an actor repository: its limits, how its text is
//! cleaned, and how it is read and written.

use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization as _;

use radicle::git;

use super::{Error, retain_fields};

/// Where the profile lives, relative to the root of the default branch.
pub const PROFILE_PATH: &str = ".radicle/profile.json";
const PROFILE_VERSION: u32 = 1;
/// The limits on the profile file's strings, in characters, and on its links.
const MAX_STRING: usize = 255;
const MAX_LABEL: usize = 64;
const MAX_LINKS: usize = 16;
/// The most bytes a profile file is read with; a valid one is a few hundred.
const MAX_PROFILE_BYTES: usize = 64 * 1024;
/// The most bytes a picture saved with the profile may have. Every node that
/// has the profile copies its pictures and keeps the earlier ones.
const MAX_AVATAR_BYTES: usize = 1024 * 1024;
const MAX_BANNER_BYTES: usize = 2 * 1024 * 1024;
/// The pictures a save takes, by what their content is, and the extension
/// each is saved under.
const IMAGE_TYPES: &[(&str, &str)] = &[
    ("image/png", "png"),
    ("image/jpeg", "jpg"),
    ("image/webp", "webp"),
    ("image/gif", "gif"),
];

/// The pictures to save in the repository with a profile, each the base64 of
/// an image file: a PNG, JPEG, WebP or GIF of at most 1 MiB for the avatar
/// and 2 MiB for the banner. The kind is told from the first bytes of the
/// file, and the rest is not decoded: what is saved may not show.
#[derive(Clone, Debug, Default, Deserialize, ts_rs::TS)]
#[ts(export)]
#[ts(export_to = "actor/")]
pub struct ProfileImages {
    #[serde(default)]
    #[ts(optional)]
    pub avatar: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub banner: Option<String>,
}

/// A picture that passed the checks of `ProfileImages::place`.
#[derive(Debug)]
pub struct ProfileImage {
    /// The file's name without its extension, which says what it is for.
    stem: &'static str,
    /// Where it is saved, relative to the root of the default branch.
    path: String,
    bytes: Vec<u8>,
}

impl ProfileImages {
    /// `profile` with the field of each picture naming the file it is saved
    /// as, and the pictures to save. The error names the field and what is
    /// wrong with its picture: not base64, too large, or not an image of a
    /// kind that is taken.
    pub fn place(
        self,
        mut profile: ActorProfile,
    ) -> Result<(ActorProfile, Vec<ProfileImage>), String> {
        use base64::Engine as _;

        let fields = [
            ("avatar", self.avatar, MAX_AVATAR_BYTES, &mut profile.avatar),
            ("banner", self.banner, MAX_BANNER_BYTES, &mut profile.banner),
        ];
        let mut images = Vec::new();
        for (stem, encoded, limit, field) in fields {
            let Some(encoded) = encoded else { continue };
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|_| format!("the {stem} picture is not base64"))?;
            if bytes.len() > limit {
                return Err(format!(
                    "the {stem} picture is {} KiB, and the limit is {} KiB",
                    bytes.len().div_ceil(1024),
                    limit / 1024
                ));
            }
            let kind = infer::get(&bytes).map(|kind| kind.mime_type());
            let Some((_, extension)) = IMAGE_TYPES.iter().find(|(mime, _)| Some(*mime) == kind)
            else {
                return Err(format!(
                    "the {stem} picture must be a PNG, JPEG, WebP or GIF image, and this is {}",
                    kind.unwrap_or("none of them")
                ));
            };
            let path = format!("{stem}.{extension}");
            *field = Some(path.clone());
            images.push(ProfileImage { stem, path, bytes });
        }

        Ok((profile, images))
    }
}

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

/// Text as it is displayed or compared: one line, without control or
/// invisible characters, then NFC, so that what is left composes; trimmed.
/// A line break or a tab stands between words, so a space takes its place.
fn clean_text(value: &str) -> String {
    // The character before, of those that stay.
    let mut before = None;

    value
        .chars()
        .filter_map(|c| {
            let is_break = c.is_control() && c.is_whitespace();
            let c = if is_break { ' ' } else { c };
            // A break after a space adds nothing to it.
            let dropped = is_hidden(c)
                || (is_emoji_selector(c) && !before.is_some_and(takes_selector))
                || (is_break && before == Some(' '));
            if dropped {
                return None;
            }
            before = Some(c);

            Some(c)
        })
        .nfc()
        .collect::<String>()
        .trim()
        .to_string()
}

fn is_hidden(c: char) -> bool {
    c.is_control() || is_invisible(c)
}

/// The two variation selectors that pick an emoji's text or picture form.
fn is_emoji_selector(c: char) -> bool {
    matches!(c, '\u{FE0E}' | '\u{FE0F}')
}

/// Whether a selector after `c` can change what shows: after a symbol or a
/// digit it can, after a letter or a space it only hides in the text.
fn takes_selector(c: char) -> bool {
    !(c.is_alphabetic() || c.is_whitespace() || is_emoji_selector(c))
}

/// Characters that do not show and can make one name look like another: the
/// line separators, and what Unicode says to ignore when text is drawn. Those
/// are the bidirectional marks, the zero-width characters, the fillers, the
/// tags and the variation selectors, but for the two of `is_emoji_selector`.
/// What is drawn with one of them loses its form: a joined emoji, the flag
/// of a region, the variant of an ideograph.
fn is_invisible(c: char) -> bool {
    matches!(
        c,
        '\u{00AD}'
            | '\u{034F}'
            | '\u{061C}'
            | '\u{115F}'..='\u{1160}'
            | '\u{17B4}'..='\u{17B5}'
            | '\u{180B}'..='\u{180F}'
            | '\u{200B}'..='\u{200F}'
            | '\u{2028}'..='\u{202E}'
            | '\u{2060}'..='\u{206F}'
            | '\u{3164}'
            | '\u{FE00}'..='\u{FE0D}'
            | '\u{FEFF}'
            | '\u{FFA0}'
            | '\u{FFF0}'..='\u{FFF8}'
            | '\u{1BCA0}'..='\u{1BCA3}'
            | '\u{1D173}'..='\u{1D17A}'
            | '\u{E0000}'..='\u{E0FFF}'
    )
}

/// Whether `name` shows nothing once cleaned; the braille blank is a
/// character that draws as a space.
fn is_blank(name: &str) -> bool {
    clean_text(name)
        .chars()
        .all(|c| c.is_whitespace() || c == '\u{2800}' || is_emoji_selector(c))
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
        if is_blank(&self.display_name) {
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
        // runs code or reads local files never gets signed. Nor does an
        // address with characters that do not show: cleaning it would point
        // it somewhere else.
        for (field, value) in [("avatar", &self.avatar), ("banner", &self.banner)] {
            let Some(image) = value else { continue };
            if image.chars().any(is_hidden) {
                return Err(format!("{field} cannot hold characters that do not show"));
            }
            if !is_image_ref(image) {
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
            if link.url.chars().any(is_hidden) {
                return Err("a link cannot hold characters that do not show".to_string());
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

    /// The file as written to the repository: its text cleaned, its addresses
    /// only trimmed, empty fields dropped. `validate` refuses an address with
    /// characters that do not show.
    pub fn normalized(mut self) -> Self {
        self.version = PROFILE_VERSION;
        self.rewritten(|address| address.trim().to_string())
    }

    /// The profile as it is displayed: every string cleaned, addresses too,
    /// and a name that shows nothing left empty.
    fn cleaned(self) -> Self {
        let mut cleaned = self.rewritten(clean_text);
        if is_blank(&cleaned.display_name) {
            cleaned.display_name.clear();
        }

        cleaned
    }

    /// Every text cleaned with `clean_text`, the image and link addresses
    /// passed through `address`, empty optional fields dropped.
    fn rewritten(mut self, address: impl Fn(&str) -> String) -> Self {
        fn kept(value: Option<String>, rewrite: impl Fn(&str) -> String) -> Option<String> {
            value.map(|v| rewrite(&v)).filter(|v| !v.is_empty())
        }

        self.display_name = clean_text(&self.display_name);
        self.full_name = kept(self.full_name, clean_text);
        self.pronouns = kept(self.pronouns, clean_text);
        self.bio = kept(self.bio, clean_text);
        self.location = kept(self.location, clean_text);
        self.timezone = kept(self.timezone, clean_text);
        self.avatar = kept(self.avatar, &address);
        self.banner = kept(self.banner, &address);
        self.links = self
            .links
            .into_iter()
            .map(|link| ProfileLink {
                url: address(&link.url),
                label: kept(link.label, clean_text),
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
            retain_fields(object, PROFILE_FIELDS);
            if let Some(links) = object.get_mut("links").and_then(|l| l.as_array_mut()) {
                for link in links.iter_mut().filter_map(|l| l.as_object_mut()) {
                    retain_fields(link, LINK_FIELDS);
                }
            }
        }
        let profile: Self = serde_json::from_value(value).ok()?;
        // Checked as a save checks it, before the addresses are cleaned:
        // cleaning one would point it somewhere else.
        let valid = profile.clone().normalized().validate().is_ok();

        Some(ReadProfile {
            profile: profile.cleaned(),
            newer,
            valid,
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
    /// A save would accept the profile as the file holds it.
    pub valid: bool,
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
    profile_tree_with(repo, parent, profile, &[], &[])
}

/// As `profile_tree`, with `images` saved at the root. An `avatar` or `banner`
/// picture at the root that the profile no longer names is left out of the
/// tree. One the profile names that `parent` lacks is taken from the first of
/// `others` that has it, so a version merged in keeps its picture; where
/// `parent` has a file of that name, that one stays. `Profile` if a folder is
/// where a picture would be saved.
pub fn profile_tree_with<'a>(
    repo: &'a git::raw::Repository,
    parent: Option<&git::raw::Tree<'a>>,
    profile: &ActorProfile,
    images: &[ProfileImage],
    others: &[git::raw::Tree<'a>],
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
    let is_file = |entry: &git2::TreeEntry| entry.kind() == Some(git2::ObjectType::Blob);
    let mut update = git2::build::TreeUpdateBuilder::new();
    update.upsert(PROFILE_PATH, blob, git::raw::FileMode::Blob);

    for (stem, named) in [("avatar", &profile.avatar), ("banner", &profile.banner)] {
        let named = named.as_deref();
        let earlier = IMAGE_TYPES
            .iter()
            .map(|(_, extension)| format!("{stem}.{extension}"))
            .filter(|path| Some(path.as_str()) != named)
            .filter(|path| baseline.get_name(path).is_some_and(|entry| is_file(&entry)));
        for path in earlier {
            update.remove(path);
        }

        if let Some(image) = images.iter().find(|image| image.stem == stem) {
            if baseline
                .get_name(&image.path)
                .is_some_and(|entry| !is_file(&entry))
            {
                return Err(Error::Profile(format!(
                    "the repository has a folder named {}, where the {stem} picture is saved",
                    image.path
                )));
            }
            update.upsert(
                image.path.as_str(),
                repo.blob(&image.bytes)?,
                git::raw::FileMode::Blob,
            );
        } else if let Some(path) = named.filter(|path| !path.contains(':')) {
            let path = std::path::Path::new(path);
            let theirs = || {
                others
                    .iter()
                    .find_map(|tree| tree.get_path(path).ok().filter(is_file))
            };
            if baseline.get_path(path).is_err()
                && let Some(entry) = theirs()
            {
                update.upsert(path, entry.id(), git::raw::FileMode::Blob);
            }
        }
    }
    let tree = update.create_updated(repo, baseline)?;

    Ok(repo.find_tree(tree)?)
}

/// The fields in which `to` differs from `from`, by their names in the file.
/// `None` is a version with no profile file, which sets no field.
pub fn changed_fields(from: Option<&ActorProfile>, to: Option<&ActorProfile>) -> Vec<&'static str> {
    let unset = ActorProfile {
        version: PROFILE_VERSION,
        display_name: String::new(),
        full_name: None,
        pronouns: None,
        bio: None,
        location: None,
        timezone: None,
        avatar: None,
        banner: None,
        links: Vec::new(),
    };
    let (from, to) = (from.unwrap_or(&unset), to.unwrap_or(&unset));
    let fields = [
        ("displayName", from.display_name != to.display_name),
        ("fullName", from.full_name != to.full_name),
        ("pronouns", from.pronouns != to.pronouns),
        ("bio", from.bio != to.bio),
        ("location", from.location != to.location),
        ("timezone", from.timezone != to.timezone),
        ("avatar", from.avatar != to.avatar),
        ("banner", from.banner != to.banner),
        ("links", from.links != to.links),
    ];

    fields
        .into_iter()
        .filter_map(|(field, changed)| changed.then_some(field))
        .collect()
}

/// What turns the profile `from` into `to`, as a unified diff of the file
/// each would be saved as.
pub fn profile_changes(from: &ActorProfile, to: &ActorProfile) -> Result<String, Error> {
    let path = std::path::Path::new(PROFILE_PATH);
    let (from, to) = (from.to_json()?, to.to_json()?);
    let mut patch = git2::Patch::from_buffers(&from, Some(path), &to, Some(path), None)?;

    Ok(String::from_utf8_lossy(&patch.to_buf()?).into_owned())
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

/// `profile` with only the pictures that can be shown from `commit`'s tree.
/// One kept in the repository stays if it is a file there within the size a
/// save allows. One at a web address stays as it is, since nothing fetches it.
/// The sizes come from the objects' headers, so no picture is loaded. One
/// that is dropped is named in the log at debug level.
pub fn with_shown_pictures(
    repo: &git::raw::Repository,
    commit: git::Oid,
    mut profile: ActorProfile,
) -> Result<ActorProfile, git::raw::Error> {
    let tree = repo.find_commit(commit.into())?.tree()?;
    let odb = repo.odb()?;
    let fits = |path: &str, limit: usize| {
        tree.get_path(std::path::Path::new(path))
            .ok()
            .filter(|entry| entry.kind() == Some(git::raw::ObjectType::Blob))
            .and_then(|entry| odb.read_header(entry.id()).ok())
            .is_some_and(|(size, _)| size <= limit)
    };

    let pictures = [
        (&mut profile.avatar, MAX_AVATAR_BYTES),
        (&mut profile.banner, MAX_BANNER_BYTES),
    ];
    for (picture, limit) in pictures {
        let shown = picture
            .as_deref()
            .is_none_or(|path| path.contains(':') || fits(path, limit));
        if !shown && let Some(path) = picture.take() {
            log::debug!(
                "Not showing the picture {path} at {commit}: it is not a file there of at most \
                 {limit} bytes"
            );
        }
    }

    Ok(profile)
}

#[cfg(test)]
mod tests;
