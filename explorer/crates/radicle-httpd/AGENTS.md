# radicle-httpd

Rust backend for the Radicle web explorer, released together with
`radicle-search` (see `RELEASE.md` in `explorer/`).

## Code conventions

- Each route module exposes `pub fn router(ctx: Context) -> Router`;
  handlers are private `async fn`s
- Handler signature:
  `async fn handler(State(ctx): State<Context>, Path(rid): Path<RepoId>) -> impl IntoResponse`
- Annotate the error type on Ok: `Ok::<_, Error>(Json(data))`
- All response structs: `#[serde(rename_all = "camelCase")]`
- Optional fields: `#[serde(skip_serializing_if = "Option::is_none")]`
- Use `json!()` macro for inline JSON; `immutable_response()` /
  `cached_response()` helpers for Cache-Control headers
- Module structure: `api/v1/` handlers, `api/json/` serialization helpers,
  `api/query.rs` query param types, `api/error.rs` error types
