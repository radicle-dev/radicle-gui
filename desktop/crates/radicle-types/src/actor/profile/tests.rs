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
fn a_bio_keeps_its_line_breaks() {
    let cleaned = ActorProfile {
        bio: Some(" Rust dev\r\n\u{0}Berlin\n".to_string()),
        location: Some("Ber\nlin".to_string()),
        ..profile("Al\nice")
    }
    .normalized();

    assert_eq!(cleaned.bio.as_deref(), Some("Rust dev\nBerlin"));
    // Every other field is one line.
    assert_eq!(cleaned.display_name, "Alice");
    assert_eq!(cleaned.location.as_deref(), Some("Berlin"));
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
