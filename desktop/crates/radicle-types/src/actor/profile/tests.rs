use super::*;

fn profile(display_name: &str) -> ActorProfile {
    ActorProfile {
        version: 1,
        display_name: display_name.to_string(),
        full_name: None,
        pronouns: None,
        bio: None,
        location: None,
        timezone: None,
        avatar: None,
        banner: None,
        links: vec![],
    }
}

#[test]
fn profile_validation_follows_the_schema() {
    assert!(profile(" ").validate().is_err());

    let long = ActorProfile {
        bio: Some("é".repeat(255)),
        ..profile("alice")
    };
    assert!(
        long.validate().is_ok(),
        "limits count characters, not bytes"
    );
    let too_long = ActorProfile {
        bio: Some("é".repeat(256)),
        ..profile("alice")
    };
    assert!(too_long.validate().unwrap_err().starts_with("bio"));

    let many = ActorProfile {
        links: (0..17)
            .map(|i| ProfileLink {
                url: format!("https://example.com/{i}"),
                label: None,
            })
            .collect(),
        ..profile("alice")
    };
    assert!(many.validate().unwrap_err().contains("16 links"));

    let link = |url: &str| ActorProfile {
        links: vec![ProfileLink {
            url: url.to_string(),
            label: None,
        }],
        ..profile("alice")
    };
    for url in [
        "HTTPS://example.com",
        "mailto:a@b.c",
        "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
    ] {
        assert!(link(url).validate().is_ok(), "{url}");
    }
    for url in ["javascript:alert(1)", "file:///etc/passwd", "example.com"] {
        assert!(link(url).validate().is_err(), "{url}");
    }
    let avatar = |value: &str| ActorProfile {
        avatar: Some(value.to_string()),
        ..profile("alice")
    };
    for value in ["images/avatar.png", "https://example.com/a.png"] {
        assert!(avatar(value).validate().is_ok(), "{value}");
    }
    for value in [
        "javascript:alert(1)",
        "/etc/passwd",
        "//evil.example/a.png",
        "../a.png",
        // A browser folds a percent-encoded dot into `..`.
        "%2e%2e/%2e%2e/a.png",
    ] {
        assert!(
            avatar(value).validate().unwrap_err().starts_with("avatar"),
            "{value}"
        );
    }
}

#[test]
fn profile_text_is_cleaned_for_display() {
    // A decomposed "é", a bidirectional override and a control character.
    let cleaned = ActorProfile {
        full_name: Some(" Ali\u{202E}ce\u{0} ".to_string()),
        ..profile("Zoe\u{301}")
    }
    .normalized();
    assert_eq!(cleaned.display_name, "Zo\u{e9}");
    assert_eq!(cleaned.full_name.as_deref(), Some("Alice"));

    // Zero-width characters, direction marks and line separators hide in a
    // name and go the same way.
    let hidden = profile("\u{FEFF}al\u{200B}i\u{200E}c\u{2028}e\u{061C}").normalized();
    assert_eq!(hidden.display_name, "alice");
}

#[test]
fn a_line_break_becomes_a_space() {
    let cleaned = ActorProfile {
        bio: Some(" Rust dev\r\n\u{0}Berlin\n".to_string()),
        location: Some("Ber\tlin".to_string()),
        ..profile("Al\nice")
    }
    .normalized();

    // No string keeps a control character, and no two words run together.
    assert_eq!(cleaned.bio.as_deref(), Some("Rust dev Berlin"));
    assert_eq!(cleaned.display_name, "Al ice");
    assert_eq!(cleaned.location.as_deref(), Some("Ber lin"));
}

/// A tree with `json` as its only file, at the profile path, whatever it
/// holds.
fn profile_file_tree<'r>(repo: &'r git::raw::Repository, json: &[u8]) -> git::raw::Tree<'r> {
    let empty = repo
        .find_tree(repo.treebuilder(None).unwrap().write().unwrap())
        .unwrap();
    let tree = git2::build::TreeUpdateBuilder::new()
        .upsert(
            PROFILE_PATH,
            repo.blob(json).unwrap(),
            git::raw::FileMode::Blob,
        )
        .create_updated(repo, &empty)
        .unwrap();
    repo.find_tree(tree).unwrap()
}

/// Reads `json` as the profile file of a commit, as Desktop does.
fn read_file(json: &[u8]) -> ProfileFile {
    let tmp = tempfile::tempdir().unwrap();
    let repo = git::raw::Repository::init_bare(tmp.path()).unwrap();
    let tree = profile_file_tree(&repo, json);
    let signature = git::raw::Signature::now("alice", "alice@example.com").unwrap();
    let commit = repo
        .commit(None, &signature, &signature, "Profile", &tree, &[])
        .unwrap();
    read_profile(&repo, commit.into()).unwrap()
}

/// The profile `json` reads as, which the case expects to be one.
fn read_back(json: &[u8]) -> ReadProfile {
    match read_file(json) {
        ProfileFile::Read(read) => *read,
        other => panic!("expected a profile, got {other:?}"),
    }
}

#[test]
fn profile_files_are_read_by_version() {
    let known = br#"{ "version": 1, "displayName": "alice" }"#;
    let read = read_back(known);
    assert_eq!(read.profile.display_name, "alice");
    assert!(!read.newer);

    // A file this version cannot read is told apart from no file, so a save
    // does not replace it unannounced.
    let unknown_field = br#"{ "version": 1, "displayName": "alice", "mood": "sunny" }"#;
    assert_eq!(read_file(unknown_field), ProfileFile::Unreadable);

    let unknown_link_field =
        br#"{ "version": 1, "displayName": "alice", "links": [{ "url": "x", "icon": "y" }] }"#;
    assert_eq!(read_file(unknown_link_field), ProfileFile::Unreadable);

    assert_eq!(
        read_file(br#"{ "displayName": "alice" }"#),
        ProfileFile::Unreadable
    );
    assert_eq!(
        read_file(br#"{ "version": 0, "displayName": "alice" }"#),
        ProfileFile::Unreadable
    );
    assert_eq!(read_file(b"not json"), ProfileFile::Unreadable);

    // A file over the size limit is not read at all, whatever it holds.
    let mut padded = br#"{"version":1,"displayName":"Alice"}"#.to_vec();
    assert!(matches!(read_file(&padded), ProfileFile::Read(_)));
    padded.resize(MAX_PROFILE_BYTES + 1, b' ');
    assert_eq!(read_file(&padded), ProfileFile::Unreadable);

    let newer = br#"{ "version": 2, "displayName": "alice", "mood": "sunny", "links": [{ "url": "https://x", "icon": "y" }] }"#;
    let read = read_back(newer);
    assert!(read.newer);
    assert_eq!(read.profile.display_name, "alice");
    assert_eq!(read.profile.links[0].url, "https://x");
}

#[test]
fn links_and_images_another_client_wrote_are_read_whole() {
    // The editor gets the file as it is, so the user sees what to fix.
    let file = br#"{ "version": 1, "displayName": "alice", "avatar": "javascript:alert(1)",
        "banner": "..\\..\\etc\\passwd", "links": [{ "url": "x" }, { "url": "javascript:alert(1)" },
        { "url": "https://x" }] }"#;
    let read = read_back(file);
    assert_eq!(read.profile.links.len(), 3);
    assert_eq!(read.profile.avatar.as_deref(), Some("javascript:alert(1)"));
    assert!(read.profile.validate().is_err());
}

#[test]
fn profile_round_trips_through_a_tree() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = git::raw::Repository::init_bare(tmp.path()).unwrap();
    let profile = ActorProfile {
        full_name: Some("Alice Liddell".to_string()),
        bio: Some(" Curiouser. ".to_string()),
        links: vec![ProfileLink {
            url: "https://example.com".to_string(),
            label: Some("".to_string()),
        }],
        ..profile("alice")
    }
    .normalized();
    let signature = git::raw::Signature::now("alice", "alice@example.com").unwrap();

    let tree = profile_tree(&repo, None, &profile).unwrap();
    let commit = repo
        .commit(None, &signature, &signature, "Create profile", &tree, &[])
        .unwrap();
    let ProfileFile::Read(read) = read_profile(&repo, commit.into()).unwrap() else {
        panic!("the profile is read back");
    };
    let read = read.profile.clone();
    assert_eq!(read.bio.as_deref(), Some("Curiouser."));
    assert_eq!(read.links[0].label, None);

    // A second write replaces the file and keeps the rest of the tree.
    let updated = ActorProfile { bio: None, ..read };
    let parent = repo.find_commit(commit).unwrap();
    let tree = profile_tree(&repo, Some(&parent.tree().unwrap()), &updated).unwrap();
    let commit = repo
        .commit(
            None,
            &signature,
            &signature,
            "Edit profile",
            &tree,
            &[&parent],
        )
        .unwrap();
    let ProfileFile::Read(read) = read_profile(&repo, commit.into()).unwrap() else {
        panic!("the profile is read back");
    };
    let read = read.profile.clone();
    assert_eq!(read.bio, None);
    assert_eq!(read.full_name.as_deref(), Some("Alice Liddell"));
}

#[test]
fn characters_that_do_not_show_are_stripped() {
    let hidden = [
        '\u{00AD}',
        '\u{034F}',
        '\u{180E}',
        '\u{2061}',
        '\u{3164}',
        '\u{FE00}',
        '\u{FFA0}',
        '\u{E0041}',
        '\u{E0100}',
    ];
    for c in hidden {
        let cleaned = profile(&format!("al{c}ice")).normalized();
        assert_eq!(cleaned.display_name, "alice", "U+{:04X}", u32::from(c));
    }

    // What is left composes, so cleaning twice changes nothing more.
    let joined = profile("Zoe\u{034F}\u{301}").normalized();
    assert_eq!(joined.display_name, "Zo\u{e9}");

    // A selector that picks an emoji's form changes what shows, so it stays
    // after a symbol or a digit. After a letter it shows nothing.
    for emoji in ["\u{2764}\u{FE0F}", "1\u{FE0F}\u{20E3}"] {
        assert_eq!(profile(emoji).normalized().display_name, emoji);
    }
    let lookalike = profile("al\u{FE0F}ice \u{FE0E}").normalized();
    assert_eq!(lookalike.display_name, "alice");
}

#[test]
fn a_name_that_shows_nothing_is_no_name() {
    let blanks = [
        "\u{3164}",
        "\u{2800}",
        " \u{2800} \u{200B}",
        "\u{FE0F}",
        "\u{2800}\u{FE0F}",
    ];
    for blank in blanks {
        assert!(profile(blank).normalized().validate().is_err(), "{blank:?}");
        assert!(profile(blank).validate().is_err(), "{blank:?} as given");
    }

    // Read from a file, such a name is empty, so that what shows the profile
    // can tell there is none.
    let read = read_back(br#"{ "version": 1, "displayName": "\u2800" }"#);
    assert_eq!(read.profile.display_name, "");
}

#[test]
fn an_address_is_refused_not_rewritten() {
    let hidden = "https://exa\u{00AD}mple.com";
    let written = ActorProfile {
        avatar: Some(format!(" {hidden} ")),
        links: vec![ProfileLink {
            url: hidden.to_string(),
            label: None,
        }],
        ..profile("alice")
    }
    .normalized();
    assert_eq!(written.avatar.as_deref(), Some(hidden), "only trimmed");
    assert_eq!(written.links[0].url, hidden);
    assert!(written.validate().unwrap_err().starts_with("avatar"));

    let link_only = ActorProfile {
        avatar: None,
        ..written
    };
    assert!(link_only.validate().unwrap_err().starts_with("a link"));

    // Read for display, it is cleaned like any other string.
    let file = format!(r#"{{ "version": 1, "displayName": "alice", "avatar": "{hidden}" }}"#);
    let read = read_back(file.as_bytes());
    assert_eq!(read.profile.avatar.as_deref(), Some("https://example.com"));
}

/// The first bytes of a file of each kind, which is all that tells them apart.
const PNG: &[u8] = b"\x89PNG\r\n\x1a\na picture";
const JPEG: &[u8] = b"\xff\xd8\xff\xe0a picture";
const PDF: &[u8] = b"%PDF-1.4 a document";

fn encoded(bytes: &[u8]) -> Option<String> {
    use base64::Engine as _;

    Some(base64::engine::general_purpose::STANDARD.encode(bytes))
}

fn avatar(bytes: &[u8]) -> ProfileImages {
    ProfileImages {
        avatar: encoded(bytes),
        banner: None,
    }
}

/// The tree of `profile` saved over `parent` with `images`, next to `others`.
fn saved<'r>(
    repo: &'r git::raw::Repository,
    parent: Option<&git::raw::Tree<'r>>,
    profile: ActorProfile,
    images: ProfileImages,
    others: &[git::raw::Tree<'r>],
) -> Result<git::raw::Tree<'r>, Error> {
    let (profile, images) = images.place(profile).map_err(Error::Profile)?;

    profile_tree_with(repo, parent, &profile, &images, others)
}

fn files(tree: &git::raw::Tree) -> Vec<String> {
    tree.iter()
        .map(|entry| entry.name().unwrap().to_owned())
        .collect()
}

fn file(repo: &git::raw::Repository, tree: &git::raw::Tree, name: &str) -> Vec<u8> {
    let entry = tree.get_name(name).unwrap();

    repo.find_blob(entry.id()).unwrap().content().to_vec()
}

#[test]
fn a_picture_is_named_by_what_its_content_is() {
    let images = ProfileImages {
        avatar: encoded(JPEG),
        banner: encoded(PNG),
    };
    let typed = ActorProfile {
        avatar: Some("https://example.com/me.png".to_string()),
        ..profile("alice")
    };

    let (placed, pictures) = images.place(typed).unwrap();

    assert_eq!(placed.avatar.as_deref(), Some("avatar.jpg"));
    assert_eq!(placed.banner.as_deref(), Some("banner.png"));
    assert_eq!(pictures.len(), 2);

    // Without a picture the fields are the form's.
    let (kept, pictures) = ProfileImages::default().place(profile("alice")).unwrap();
    assert_eq!(kept, profile("alice"));
    assert!(pictures.is_empty());
}

#[test]
fn a_picture_over_its_limit_or_of_no_taken_kind_is_refused() {
    let sized = |bytes: usize| {
        let mut picture = PNG.to_vec();
        picture.resize(bytes, 0);
        picture
    };
    let banner = |bytes: &[u8]| ProfileImages {
        avatar: None,
        banner: encoded(bytes),
    };

    assert!(
        avatar(&sized(MAX_AVATAR_BYTES))
            .place(profile("alice"))
            .is_ok()
    );
    let refused = avatar(&sized(MAX_AVATAR_BYTES + 1))
        .place(profile("alice"))
        .unwrap_err();
    assert!(refused.contains("avatar"));

    // The banner has its own limit.
    assert!(
        banner(&sized(MAX_AVATAR_BYTES + 1))
            .place(profile("alice"))
            .is_ok()
    );
    let refused = banner(&sized(MAX_BANNER_BYTES + 1))
        .place(profile("alice"))
        .unwrap_err();
    assert!(refused.contains("banner"));

    let refused = banner(PDF).place(profile("alice")).unwrap_err();
    assert!(refused.contains("banner") && refused.contains("application/pdf"));
    assert!(avatar(b"").place(profile("alice")).is_err());

    let not_base64 = ProfileImages {
        avatar: Some("not base64!".to_string()),
        banner: None,
    };
    assert!(not_base64.place(profile("alice")).is_err());
}

#[test]
fn a_picture_the_profile_stops_naming_leaves_the_tree() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = git::raw::Repository::init_bare(tmp.path()).unwrap();
    let none = ProfileImages::default;
    let with_png = saved(&repo, None, profile("alice"), avatar(PNG), &[]).unwrap();
    assert_eq!(files(&with_png), [".radicle", "avatar.png"]);
    assert_eq!(file(&repo, &with_png, "avatar.png"), PNG);
    let named = || ActorProfile {
        avatar: Some("avatar.png".to_string()),
        ..profile("alice")
    };

    // A save that still names it keeps it.
    let kept = saved(&repo, Some(&with_png), named(), none(), &[]).unwrap();
    assert_eq!(files(&kept), [".radicle", "avatar.png"]);

    // One of another kind takes its place.
    let replaced = saved(&repo, Some(&with_png), named(), avatar(JPEG), &[]).unwrap();
    assert_eq!(files(&replaced), [".radicle", "avatar.jpg"]);

    // A cleared field, or one that names an address, has no file.
    let cleared = saved(&repo, Some(&with_png), profile("alice"), none(), &[]).unwrap();
    assert_eq!(files(&cleared), [".radicle"]);
    let linked = ActorProfile {
        avatar: Some("https://example.com/me.png".to_string()),
        ..profile("alice")
    };
    let linked = saved(&repo, Some(&with_png), linked, none(), &[]).unwrap();
    assert_eq!(files(&linked), [".radicle"]);
}

#[test]
fn a_folder_where_a_picture_goes_is_not_replaced() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = git::raw::Repository::init_bare(tmp.path()).unwrap();
    let empty = saved(&repo, None, profile("alice"), ProfileImages::default(), &[]).unwrap();
    let with_folder = git2::build::TreeUpdateBuilder::new()
        .upsert(
            "avatar.png/inside.txt",
            repo.blob(b"kept").unwrap(),
            git::raw::FileMode::Blob,
        )
        .create_updated(&repo, &empty)
        .unwrap();
    let with_folder = repo.find_tree(with_folder).unwrap();

    let refused = saved(
        &repo,
        Some(&with_folder),
        profile("alice"),
        avatar(PNG),
        &[],
    );
    assert!(matches!(refused, Err(Error::Profile(_))));

    // Nor does a save that names no picture take it away.
    let kept = saved(
        &repo,
        Some(&with_folder),
        profile("alice"),
        ProfileImages::default(),
        &[],
    )
    .unwrap();
    assert_eq!(files(&kept), [".radicle", "avatar.png"]);
}

#[test]
fn a_picture_only_a_merged_version_has_comes_along() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = git::raw::Repository::init_bare(tmp.path()).unwrap();
    let none = ProfileImages::default;
    let mine = saved(&repo, None, profile("alice"), none(), &[]).unwrap();
    let theirs = saved(&repo, None, profile("alice"), avatar(PNG), &[]).unwrap();
    let named = || ActorProfile {
        avatar: Some("avatar.png".to_string()),
        ..profile("alice")
    };

    let merged = saved(
        &repo,
        Some(&mine),
        named(),
        none(),
        std::slice::from_ref(&theirs),
    )
    .unwrap();
    assert_eq!(file(&repo, &merged, "avatar.png"), PNG);

    // A profile that does not name it leaves it behind.
    let without = saved(
        &repo,
        Some(&mine),
        profile("alice"),
        none(),
        std::slice::from_ref(&theirs),
    )
    .unwrap();
    assert_eq!(files(&without), [".radicle"]);

    // Where both have a file of that name, the one saved over stays.
    let other_bytes = b"\x89PNG\r\n\x1a\nanother picture";
    let mine = saved(&repo, None, profile("alice"), avatar(other_bytes), &[]).unwrap();
    let merged = saved(&repo, Some(&mine), named(), none(), &[theirs]).unwrap();
    assert_eq!(file(&repo, &merged, "avatar.png"), other_bytes);
}
