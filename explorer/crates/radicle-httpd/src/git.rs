use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::str;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{ConnectInfo, Path as AxumPath, RawQuery, Request, State};
use axum::http::header::HeaderName;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::IntoResponse;
use axum::routing::any;
use axum::Router;
use axum_listener::DualAddr;

use futures_util::TryStreamExt;
use radicle::identity::RepoId;
use radicle::node::NodeId;
use radicle::profile::Profile;
use radicle::storage::{ReadRepository, ReadStorage};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::io::{ReaderStream, StreamReader};
use tower_http::decompression::RequestDecompressionLayer;

use crate::error::GitError as Error;

pub fn router(profile: Arc<Profile>, aliases: Arc<HashMap<String, RepoId>>) -> Router {
    Router::new()
        .route(
            "/{rid}/{*path}",
            any(git_handler).layer(RequestDecompressionLayer::new()),
        )
        .with_state((profile, aliases))
}

async fn git_handler(
    State((profile, aliases)): State<(Arc<Profile>, Arc<HashMap<String, RepoId>>)>,
    AxumPath((repository, path)): AxumPath<(String, String)>,
    method: Method,
    headers: HeaderMap,
    ConnectInfo(remote): ConnectInfo<DualAddr>,
    query: RawQuery,
    request: Request,
) -> impl IntoResponse {
    let query = query.0.unwrap_or_default();
    let name = repository.strip_suffix(".git").unwrap_or(&repository);
    let Some(rid) = crate::resolve_rid(name, &aliases) else {
        return Err(Error::NotFound);
    };

    let (nid, path): (Option<NodeId>, &str) = {
        let (first, rest) = path.split_once('/').unwrap_or((&path, ""));
        match first.parse::<NodeId>() {
            Ok(nid) => (Some(nid), rest),
            Err(_) => (None, &path),
        }
    };

    let (status, headers, body) = git_http_backend(
        &profile, method, headers, request, remote, rid, nid, path, query,
    )
    .await?;

    let mut response_headers = HeaderMap::new();
    for (name, vec) in headers.iter() {
        for value in vec {
            let header: HeaderName = name.try_into()?;
            response_headers.insert(header, value.parse()?);
        }
    }

    Ok::<_, Error>((status, response_headers, body))
}

async fn git_http_backend(
    profile: &Profile,
    method: Method,
    headers: HeaderMap,
    request: Request,
    remote: DualAddr,
    id: RepoId,
    nid: Option<NodeId>,
    path: &str,
    query: String,
) -> Result<(StatusCode, HashMap<String, Vec<String>>, Body), Error> {
    let git_dir = radicle::storage::git::paths::repository(&profile.storage, &id);
    let content_type = headers
        .get("Content-Type")
        .and_then(|x| x.to_str().ok())
        .unwrap_or_default();

    // Don't allow cloning of private repositories.
    let doc = profile.storage.repository(id)?.identity_doc()?;
    if doc.visibility().is_private() {
        return Err(Error::NotFound);
    }

    // Reject push requests.
    match (path, query.as_str()) {
        ("git-receive-pack", _) | (_, "service=git-receive-pack") => {
            return Err(Error::ServiceUnavailable("git-receive-pack"));
        }
        _ => {}
    };

    tracing::debug!("id: {:?}", id);
    tracing::debug!("headers: {:?}", headers);
    tracing::debug!("path: {:?}", path);
    tracing::debug!("method: {:?}", method.as_str());
    tracing::debug!("remote: {:?}", remote);

    let mut cmd = Command::new("git");

    if let Some(nid) = nid {
        cmd.env("GIT_NAMESPACE", nid.to_string());
    }

    if let Some(value) = headers.get("Git-Protocol") {
        match value.to_str() {
            Ok(git_protocol) => {
                cmd.env("GIT_PROTOCOL", git_protocol);
            }
            Err(err) => tracing::debug!(
                "Value of 'Git-Protocol' header could not be converted to a string and will not be passed to Git: {err}"
            ),
        }
    }

    let mut child = cmd
        // This is a workaround to allow fetching particular commits by their OID.
        // Otherwise, the client errors with "Server does not allow request for unadvertised object"
        // See also `REF_UNADVERTISED_NOT_ALLOWED` in Git's `fetch-pack.c` (as of 0bd2d79).
        .args(["-c", "uploadpack.allowAnySHA1InWant"])
        .arg("http-backend")
        .env("REQUEST_METHOD", method.as_str())
        .env("GIT_PROJECT_ROOT", git_dir)
        // "The GIT_HTTP_EXPORT_ALL environmental variable may be passed to git-http-backend to bypass
        // the check for the "git-daemon-export-ok" file in each repository before allowing export of
        // that repository."
        .env("GIT_HTTP_EXPORT_ALL", String::default())
        .env("PATH_INFO", Path::new("/").join(path))
        .env("CONTENT_TYPE", content_type)
        .env("QUERY_STRING", query)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .stdin(Stdio::piped())
        .spawn()?;

    let mut stdin = child.stdin.take().expect("stdin was captured");
    let body = request
        .into_body()
        .into_data_stream()
        .map_err(std::io::Error::other);
    let mut body = StreamReader::new(body);
    tokio::spawn(async move {
        let _ = tokio::io::copy(&mut body, &mut stdin).await;
    });

    let stderr = BufReader::new(child.stderr.take().expect("stderr was captured"));
    tokio::spawn(async move {
        let mut lines = stderr.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            tracing::error!("git-http-backend: stderr: {}", line.trim_end());
        }
    });

    let mut stdout = BufReader::new(child.stdout.take().expect("stdout was captured"));

    let mut headers = HashMap::<String, Vec<String>>::new();

    let mut line = String::new();
    while stdout.read_line(&mut line).await? != 0 {
        if line.ends_with("\r\n") {
            line.truncate(line.len() - 2);
        }
        if line.is_empty() {
            break;
        }

        let Some((key, value)) = line.split_once(": ") else {
            return Err(Error::BackendHeader(line));
        };
        headers.entry(key.into()).or_default().push(value.into());
        line.clear();
    }

    tracing::debug!("git-http-backend: {:?}", &headers);

    let status = headers
        .remove("Status")
        .as_ref()
        .and_then(|values| values.first()?.split_whitespace().next()?.parse().ok())
        .unwrap_or(StatusCode::OK);

    let body = Body::from_stream(ReaderStream::new(stdout));

    Ok((status, headers, body))
}

#[cfg(test)]
mod routes {
    use std::collections::HashMap;
    use std::net::SocketAddr;
    use std::str::FromStr;
    use std::sync::Arc;

    use axum::extract::connect_info::MockConnectInfo;
    use axum::http::StatusCode;
    use axum_listener::DualAddr;
    use radicle::identity::RepoId;

    use crate::test::{self, get, get_with_headers, RID};

    #[tokio::test]
    async fn test_info_request() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let app = super::router(ctx.profile().to_owned(), Arc::new(HashMap::new())).layer(
            MockConnectInfo(DualAddr::Tcp(SocketAddr::from(([0, 0, 0, 0], 8080)))),
        );

        let response = get(&app, format!("/{RID}.git/info/refs")).await;

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_info_refs_advertises_protocol_v2() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let app = super::router(ctx.profile().to_owned(), Arc::new(HashMap::new())).layer(
            MockConnectInfo(DualAddr::Tcp(SocketAddr::from(([0, 0, 0, 0], 8080)))),
        );

        let response = get_with_headers(
            &app,
            format!("/{RID}.git/info/refs?service=git-upload-pack"),
            [("Git-Protocol", "version=2")],
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.body().await;
        assert!(
            body.starts_with(b"000eversion 2\n"),
            "expected a version 2 advertisement, got: {:?}",
            String::from_utf8_lossy(&body[..body.len().min(64)])
        );
    }

    #[tokio::test]
    async fn test_info_refs_defaults_to_protocol_v0() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let app = super::router(ctx.profile().to_owned(), Arc::new(HashMap::new())).layer(
            MockConnectInfo(DualAddr::Tcp(SocketAddr::from(([0, 0, 0, 0], 8080)))),
        );

        let response = get(
            &app,
            format!("/{RID}.git/info/refs?service=git-upload-pack"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.body().await;
        assert!(
            body.starts_with(b"001e# service=git-upload-pack\n"),
            "expected a version 0 advertisement, got: {:?}",
            String::from_utf8_lossy(&body[..body.len().min(64)])
        );
    }

    #[tokio::test]
    async fn test_info_refs_with_undecodable_protocol_header() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let app = super::router(ctx.profile().to_owned(), Arc::new(HashMap::new())).layer(
            MockConnectInfo(DualAddr::Tcp(SocketAddr::from(([0, 0, 0, 0], 8080)))),
        );

        let response = get_with_headers(
            &app,
            format!("/{RID}.git/info/refs?service=git-upload-pack"),
            [("Git-Protocol", "version=\u{ff}2")],
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.body().await;
        assert!(
            body.starts_with(b"001e# service=git-upload-pack\n"),
            "expected a version 0 advertisement, got: {:?}",
            String::from_utf8_lossy(&body[..body.len().min(64)])
        );
    }

    #[tokio::test]
    async fn test_aliases() {
        let tmp = tempfile::tempdir().unwrap();
        let ctx = test::seed(tmp.path());
        let app = super::router(
            ctx.profile().to_owned(),
            Arc::new(HashMap::from_iter([(
                String::from("heartwood"),
                RepoId::from_str(RID).unwrap(),
            )])),
        )
        .layer(MockConnectInfo(DualAddr::Tcp(SocketAddr::from((
            [0, 0, 0, 0],
            8080,
        )))));

        let response = get(&app, "/woodheart.git/info/refs").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = get(&app, "/heartwood.git/info/refs").await;
        assert_eq!(response.status(), StatusCode::OK);
    }
}
