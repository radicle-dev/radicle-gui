use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::IntoResponse;
use axum::Extension;
use axum_listener::DualAddr;
use hyper::{Method, StatusCode, Uri, Version};

use crate::logger::LogFormat;

#[derive(Clone)]
pub struct RequestId(Arc<AtomicU64>);

impl RequestId {
    pub fn new() -> RequestId {
        RequestId(Arc::new(0.into()))
    }

    pub fn next(&mut self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst)
    }
}

#[derive(Clone)]
pub struct TracingInfo {
    pub connect_info: ConnectInfo<DualAddr>,
    pub method: Method,
    pub version: Version,
    pub uri: Uri,
}

pub fn log_response(
    format: LogFormat,
    info: &TracingInfo,
    status: StatusCode,
    latency: Duration,
    bytes: Option<u64>,
) {
    let client = match info.connect_info.0 {
        DualAddr::Tcp(addr) => addr.to_string(),
        #[cfg(unix)]
        DualAddr::Uds(_) => "unix-socket".to_string(),
    };

    match format {
        LogFormat::Json => tracing::info!(
            client = %client,
            method = %info.method,
            uri = %info.uri,
            version = ?info.version,
            status = status.as_u16(),
            latency_ms = latency.as_micros() as f64 / 1000.0,
            bytes = bytes.unwrap_or(0),
            "request completed",
        ),
        LogFormat::Text => tracing::info!(
            "{} \"{} {} {:?}\" {} {:?} {}",
            client,
            info.method,
            info.uri,
            info.version,
            status,
            latency,
            bytes.unwrap_or(0),
        ),
    }
}

pub async fn tracing_middleware(request: Request<Body>, next: Next) -> impl IntoResponse {
    let connect_info = request
        .extensions()
        .get::<ConnectInfo<DualAddr>>()
        .unwrap()
        .clone();

    let method = request.method().clone();
    let version = request.version();
    let uri = request.uri().clone();

    let tracing_info = TracingInfo {
        connect_info,
        method,
        version,
        uri,
    };

    let response = next.run(request).await;

    (Extension(tracing_info), response)
}

#[cfg(test)]
mod tests {
    use std::io;
    use std::net::SocketAddr;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use tracing_subscriber::fmt::MakeWriter;
    use tracing_subscriber::layer::SubscriberExt as _;
    use tracing_subscriber::Layer;

    use super::*;
    use crate::logger::{json_layer, text_layer, LogFormat};

    #[derive(Clone, Default)]
    struct Buffer(Arc<Mutex<Vec<u8>>>);

    impl Buffer {
        fn contents(&self) -> String {
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
        }
    }

    impl io::Write for Buffer {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().write(buf)
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'a> MakeWriter<'a> for Buffer {
        type Writer = Buffer;

        fn make_writer(&'a self) -> Self::Writer {
            self.clone()
        }
    }

    fn info() -> TracingInfo {
        TracingInfo {
            connect_info: ConnectInfo(DualAddr::Tcp(SocketAddr::from(([1, 2, 3, 4], 5678)))),
            method: Method::GET,
            version: hyper::Version::HTTP_11,
            uri: "/api/v1/node".parse().unwrap(),
        }
    }

    fn capture<L>(layer: L, f: impl FnOnce())
    where
        L: Layer<tracing_subscriber::Registry> + Send + Sync + 'static,
    {
        let subscriber = tracing_subscriber::Registry::default().with(layer);
        tracing::subscriber::with_default(subscriber, f);
    }

    #[test]
    fn json_format_logs_the_response_as_fields() {
        let buffer = Buffer::default();
        capture(json_layer(buffer.clone()), || {
            log_response(
                LogFormat::Json,
                &info(),
                StatusCode::NOT_FOUND,
                Duration::from_millis(7),
                Some(1024),
            );
        });

        let record: serde_json::Value = serde_json::from_str(buffer.contents().trim()).unwrap();
        assert_eq!(record["client"], "1.2.3.4:5678");
        assert_eq!(record["method"], "GET");
        assert_eq!(record["uri"], "/api/v1/node");
        assert_eq!(record["version"], "HTTP/1.1");
        assert_eq!(record["status"], 404);
        assert_eq!(record["latency_ms"], 7.0);
        assert_eq!(record["bytes"], 1024);
    }

    #[test]
    fn json_format_reports_a_missing_body_size_as_zero_bytes() {
        let buffer = Buffer::default();
        capture(json_layer(buffer.clone()), || {
            log_response(
                LogFormat::Json,
                &info(),
                StatusCode::OK,
                Duration::from_millis(1),
                None,
            );
        });

        let record: serde_json::Value = serde_json::from_str(buffer.contents().trim()).unwrap();
        assert_eq!(record["bytes"], 0);
    }

    #[test]
    fn text_format_keeps_the_single_line_layout() {
        let buffer = Buffer::default();
        capture(text_layer(buffer.clone()), || {
            log_response(
                LogFormat::Text,
                &info(),
                StatusCode::NOT_FOUND,
                Duration::from_millis(12),
                Some(1024),
            );
        });

        let out = buffer.contents();
        assert!(
            out.contains("1.2.3.4:5678 \"GET /api/v1/node HTTP/1.1\" 404 Not Found 12ms 1024"),
            "got: {out:?}"
        );
    }

    #[test]
    fn text_format_adds_no_structured_fields() {
        let buffer = Buffer::default();
        capture(text_layer(buffer.clone()), || {
            log_response(
                LogFormat::Text,
                &info(),
                StatusCode::OK,
                Duration::from_millis(1),
                Some(7),
            );
        });

        let out = buffer.contents();
        assert!(!out.contains("status="), "got: {out:?}");
        assert!(!out.contains("latency_ms="), "got: {out:?}");
    }
}
