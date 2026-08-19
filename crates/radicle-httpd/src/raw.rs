use std::collections::HashMap;
use std::str::FromStr;
use std::sync::{Arc, LazyLock};

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{header, HeaderValue, Method, Response, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use hyper::HeaderMap;
use radicle_surf::blob::{Blob, BlobRef};

use radicle::git::raw::ErrorCode;
use radicle::git::Oid;
use radicle::prelude::RepoId;
use radicle::profile::Profile;
use radicle::storage::{ReadRepository, ReadStorage};
use radicle_surf::Repository;
use tokio::io::BufReader;
use tokio::process::Command;
use tokio_util::io::ReaderStream;

use crate::api::query::RawQuery;
use crate::axum_extra::Path;
use crate::error::RawError as Error;

const MAX_BLOB_SIZE: usize = 10_485_760;

/// Whether the `zstd` binary that `tar.zst` archives shell out to is in `PATH`.
static ZSTD_AVAILABLE: LazyLock<bool> = LazyLock::new(|| {
    std::process::Command::new("zstd")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
});

/// Values for `git archive --format` that we support.
#[derive(Debug, Default)]
enum ArchiveFormat {
    Tar,
    TarZst,
    // NOTE: Even though `git archive` would use `tar` as the default format,
    // we use `tar.gz` as the default format for HTTP responses, to benefit
    // from compression when downloading large repositories. It was also used
    // before the `ArchiveFormat` enum was introduced, so this default will
    // also surprise less.
    #[default]
    TarGz,
    Zip,
}

impl ArchiveFormat {
    const fn as_str(&self) -> &'static str {
        match self {
            ArchiveFormat::Tar => "tar",
            ArchiveFormat::TarGz => "tar.gz",
            ArchiveFormat::TarZst => "tar.zst",
            ArchiveFormat::Zip => "zip",
        }
    }

    const fn extension(&self) -> &'static str {
        match self {
            ArchiveFormat::Tar => ".tar",
            ArchiveFormat::TarGz => ".tar.gz",
            ArchiveFormat::TarZst => ".tar.zst",
            ArchiveFormat::Zip => ".zip",
        }
    }

    /// The MIME type associated with this archive format.
    /// See <https://developer.mozilla.org/docs/Web/HTTP/Guides/MIME_types/Common_types>.
    const fn mime_type(&self) -> &'static str {
        match self {
            ArchiveFormat::Tar => "application/x-tar",
            ArchiveFormat::TarGz => "application/gzip",
            ArchiveFormat::TarZst => "application/zstd",
            ArchiveFormat::Zip => "application/zip",
        }
    }

    /// Detect the archive format from the suffix of the given string.
    /// If a supported suffix is found, the suffix is stripped from the string
    /// and the corresponding format is returned.
    /// Otherwise, the original string is returned and `None` is returned for
    /// the format.
    fn detect(s: &str) -> (&str, Option<Self>) {
        if let Some(stripped) = s.strip_suffix(ArchiveFormat::Tar.extension()) {
            (stripped, Some(ArchiveFormat::Tar))
        } else if let Some(stripped) = s.strip_suffix(ArchiveFormat::TarGz.extension()) {
            (stripped, Some(ArchiveFormat::TarGz))
        } else if let Some(stripped) = s.strip_suffix(ArchiveFormat::TarZst.extension()) {
            (stripped, Some(ArchiveFormat::TarZst))
        } else if let Some(stripped) = s.strip_suffix(ArchiveFormat::Zip.extension()) {
            (stripped, Some(ArchiveFormat::Zip))
        } else {
            (s, None)
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(default)]
struct PrefixQuery {
    /// Whether to include a prefix in the archive, i.e. whether to specify
    /// `git archive --prefix`. Defaults to `true`.
    prefix: bool,
}

impl Default for PrefixQuery {
    fn default() -> Self {
        Self { prefix: true }
    }
}

enum Committish<'a> {
    Oid(Oid),
    Ref(&'a str),
}

pub fn router(profile: Arc<Profile>, aliases: Arc<HashMap<String, RepoId>>) -> Router {
    Router::new()
        .route("/{rid}/{sha}", get(commit_handler))
        .route("/{rid}/{sha}/{*path}", get(file_by_commit_handler))
        .route("/{rid}/head/{*path}", get(file_by_canonical_head_handler))
        .route("/{rid}/archive/{*refname}", get(archive_by_refname_handler))
        .route("/{rid}/blobs/{oid}", get(file_by_oid_handler))
        .with_state((profile, aliases))
}

/// Resolve a repo path segment to a [`RepoId`], mapping an unknown segment to
/// [`Error::NotFound`].
fn resolve_rid(repo: &str, aliases: &HashMap<String, RepoId>) -> Result<RepoId, Error> {
    crate::resolve_rid(repo, aliases).ok_or(Error::NotFound)
}

async fn commit_handler(
    method: Method,
    Path((rid, sha)): Path<(String, String)>,
    Query(q): Query<PrefixQuery>,
    State((profile, aliases)): State<(Arc<Profile>, Arc<HashMap<String, RepoId>>)>,
) -> Result<Response<Body>, Error> {
    let rid = resolve_rid(&rid, &aliases)?;
    let storage = &profile.storage;
    let repo = storage.repository(rid)?;

    // Do not allow accessing private repos.
    if repo.identity_doc()?.visibility().is_private() {
        return Err(Error::NotFound);
    }

    let (sha, Some(format)) = ArchiveFormat::detect(&sha) else {
        return Err(Error::NotFound);
    };

    let Ok(oid) = Oid::from_str(sha) else {
        return Err(Error::BadRequest);
    };

    archive_by_committish(method, rid, Committish::Oid(oid), q.prefix, format, profile).await
}

async fn file_by_commit_handler(
    Path((rid, sha, path)): Path<(String, Oid, String)>,
    State((profile, aliases)): State<(Arc<Profile>, Arc<HashMap<String, RepoId>>)>,
) -> impl IntoResponse {
    let rid = resolve_rid(&rid, &aliases)?;
    let storage = &profile.storage;
    let repo = storage.repository(rid)?;

    // Don't allow downloading raw files for private repos.
    if repo.identity_doc()?.visibility().is_private() {
        return Err(Error::NotFound);
    }

    let repo: Repository = repo.backend.into();
    let blob = repo.blob(
        radicle_surf::Oid::from(radicle::git::raw::Oid::from(sha)),
        &path,
    )?;

    blob_response(blob, &path)
}

async fn archive_by_refname_handler(
    method: Method,
    Path((rid, refname)): Path<(String, String)>,
    Query(q): Query<PrefixQuery>,
    State((profile, aliases)): State<(Arc<Profile>, Arc<HashMap<String, RepoId>>)>,
) -> Result<Response<Body>, Error> {
    let rid = resolve_rid(&rid, &aliases)?;
    let (refname, format) = ArchiveFormat::detect(&refname);
    archive_by_committish(
        method,
        rid,
        Committish::Ref(refname),
        q.prefix,
        format.unwrap_or_default(),
        profile,
    )
    .await
}

async fn archive_by_committish(
    method: Method,
    rid: RepoId,
    committish: Committish<'_>,
    use_prefix: bool,
    format: ArchiveFormat,
    profile: Arc<Profile>,
) -> Result<Response<Body>, Error> {
    // Without zstd, git would stream an empty body after a 200 response.
    if matches!(format, ArchiveFormat::TarZst) && !*ZSTD_AVAILABLE {
        return Err(Error::NotFound);
    }

    let storage = &profile.storage;
    let repo = storage.repository(rid)?;

    // Do not allow downloading tarballs for private repos.
    if repo.identity_doc()?.visibility().is_private() {
        return Err(Error::NotFound);
    }

    let doc = repo.identity_doc()?;
    let project = doc.project()?;
    let repo_name = project.name();

    let oid = match committish {
        Committish::Oid(oid) => oid,
        Committish::Ref(refname) => repo
            .backend
            .resolve_reference_from_short_name(refname)
            .map(|reference| reference.target())?
            .ok_or(Error::NotFound)?
            .into(),
    };

    if let Err(e) = repo.backend.find_object(oid.into(), None) {
        return Err(if e.code() == ErrorCode::NotFound {
            Error::NotFound
        } else {
            Error::Git(e)
        });
    }

    // Build a prefix for the archive, which includes the
    // refname (if one was given):
    //
    // Without refname:   <repo-name>-<oid>
    // With    refname:   <repo-name>-<refname>
    let prefix = {
        let mut build = String::from(repo_name);
        build.push('-');

        build.push_str(&match committish {
            Committish::Oid(oid) => oid.to_string(),
            Committish::Ref(refname) => {
                // NOTE: Sanitize refnames according to
                // <https://git-scm.com/docs/git-check-ref-format>
                refname.replace("/", "-")
            }
        });

        build
    };

    let mut response_headers = HeaderMap::new();
    response_headers.insert("Content-Type", HeaderValue::from_str(format.mime_type())?);
    response_headers.insert(
        "Content-Disposition",
        HeaderValue::from_str(&format!(
            "attachment; filename=\"{prefix}{}\"",
            format.extension()
        ))?,
    );

    let response = response_headers.into_response();

    if method == Method::HEAD {
        return Ok(response);
    }

    let mut command = Command::new("git");

    // Git has no builtin zstd tar format, so we register one.
    if matches!(format, ArchiveFormat::TarZst) {
        command.arg("-c").arg("tar.tar.zst.command=zstd");
    }

    command
        .arg("archive")
        .arg(format!("--format={}", format.as_str()));

    if use_prefix {
        command.arg(format!("--prefix={prefix}/"));
    }

    let mut child = command
        .arg(oid.to_string())
        .arg("--")
        .current_dir(repo.path())
        .stdout(std::process::Stdio::piped())
        .spawn()?;

    let mut response = response;
    *response.body_mut() = Body::from_stream(ReaderStream::new(BufReader::new(
        child.stdout.take().expect("stdout was captured"),
    )));

    Ok(response)
}

async fn file_by_canonical_head_handler(
    Path((rid, path)): Path<(String, String)>,
    State((profile, aliases)): State<(Arc<Profile>, Arc<HashMap<String, RepoId>>)>,
) -> impl IntoResponse {
    let rid = resolve_rid(&rid, &aliases)?;
    let storage = &profile.storage;
    let repo = storage.repository(rid)?;

    // Don't allow downloading raw files for private repos.
    if repo.identity_doc()?.visibility().is_private() {
        return Err(Error::NotFound);
    }

    let (_, sha) = repo.head()?;
    let repo: Repository = repo.backend.into();
    let blob = repo.blob(
        radicle_surf::Oid::from(radicle::git::raw::Oid::from(sha)),
        &path,
    )?;

    blob_response(blob, &path)
}

fn blob_response(
    blob: Blob<BlobRef>,
    path: &str,
) -> Result<(StatusCode, HeaderMap, Vec<u8>), Error> {
    let mut response_headers = HeaderMap::new();
    if blob.size() > MAX_BLOB_SIZE {
        return Ok::<_, Error>((StatusCode::PAYLOAD_TOO_LARGE, response_headers, vec![]));
    }

    let mime = mime_guess::from_path(path)
        .first_raw()
        .or_else(|| infer::get(blob.content()).map(|i| i.mime_type()))
        .unwrap_or("application/octet-stream");

    response_headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(mime)?);

    Ok::<_, Error>((StatusCode::OK, response_headers, blob.content().to_owned()))
}

async fn file_by_oid_handler(
    Path((rid, oid)): Path<(String, Oid)>,
    State((profile, aliases)): State<(Arc<Profile>, Arc<HashMap<String, RepoId>>)>,
    Query(_qs): Query<RawQuery>,
) -> impl IntoResponse {
    let rid = resolve_rid(&rid, &aliases)?;
    let storage = &profile.storage;
    let repo = storage.repository(rid)?;

    // Don't allow downloading raw files for private repos.
    if repo.identity_doc()?.visibility().is_private() {
        return Err(Error::NotFound);
    }

    let blob = repo.blob(oid)?;
    let content = blob.content();
    let mime = infer::get(content).map(|i| i.mime_type().to_string());
    let mut response_headers = HeaderMap::new();

    if blob.size() > MAX_BLOB_SIZE {
        return Ok::<_, Error>((StatusCode::PAYLOAD_TOO_LARGE, response_headers, vec![]));
    }

    response_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&mime.unwrap_or("application/octet-stream".to_string()))?,
    );

    Ok::<_, Error>((StatusCode::OK, response_headers, content.to_vec()))
}

#[cfg(test)]
mod routes {
    use std::collections::HashMap;
    use std::sync::Arc;

    use axum::http::StatusCode;

    use crate::test::{self, get, RID, RID_PRIVATE};
    use radicle::storage::ReadStorage;

    #[tokio::test]
    async fn test_file_handler() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let app = super::router(ctx.profile().to_owned(), Arc::new(HashMap::new()));

        let response = get(&app, format!("/{RID}/head/dir1/README")).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body().await, "Hello World from dir1!\n");

        // Make sure the repo exists in storage.
        ctx.profile()
            .storage
            .repository(RID_PRIVATE.parse().unwrap())
            .unwrap();

        let response = get(&app, format!("/{RID_PRIVATE}/head/README")).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_archive_tar_zst() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let app = super::router(ctx.profile().to_owned(), Arc::new(HashMap::new()));

        let response = get(&app, format!("/{RID}/archive/master.tar.zst")).await;

        // Git shells out to zstd for this format.
        if !*super::ZSTD_AVAILABLE {
            assert!(
                std::env::var_os("CI").is_none(),
                "zstd must be in PATH on CI"
            );
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
            return;
        }
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get("Content-Type").unwrap(),
            "application/zstd"
        );

        // zstd magic number.
        let body = response.body().await;
        assert_eq!(&body[..4], &[0x28, 0xb5, 0x2f, 0xfd]);
    }

    #[tokio::test]
    async fn test_alias_resolution() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let aliases = Arc::new(HashMap::from_iter([(
            "hello".to_string(),
            RID.parse().unwrap(),
        )]));
        let app = super::router(ctx.profile().to_owned(), aliases);

        // The alias serves the same content as the RID.
        let response = get(&app, "/hello/head/dir1/README").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body().await, "Hello World from dir1!\n");

        // An unknown alias is not found.
        let response = get(&app, "/nope/head/dir1/README").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
