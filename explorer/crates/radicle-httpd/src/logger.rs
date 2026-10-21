use std::sync::OnceLock;

use tracing::dispatcher::Dispatch;
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::layer::{Layered, SubscriberExt as _};
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::{EnvFilter, Layer, Registry};

pub const LOG_FORMAT_VAR: &str = "RADICLE_HTTPD_LOG_FORMAT";

type Filtered = Layered<EnvFilter, Registry>;
type BoxedLayer = Box<dyn Layer<Filtered> + Send + Sync>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LogFormat {
    #[default]
    Text,
    Json,
}

impl LogFormat {
    pub fn parse(value: Option<&str>) -> LogFormat {
        match value.map(str::trim).map(str::to_lowercase).as_deref() {
            None | Some("") | Some("text") => LogFormat::Text,
            Some("json") => LogFormat::Json,
            Some(other) => {
                eprintln!("{LOG_FORMAT_VAR}: unknown format {other:?}, falling back to \"text\"");
                LogFormat::Text
            }
        }
    }

    pub fn from_env() -> LogFormat {
        LogFormat::parse(std::env::var(LOG_FORMAT_VAR).ok().as_deref())
    }
}

static FORMAT: OnceLock<LogFormat> = OnceLock::new();

pub fn format() -> LogFormat {
    *FORMAT.get_or_init(LogFormat::from_env)
}

pub fn init() -> Result<(), tracing::subscriber::SetGlobalDefaultError> {
    tracing::dispatcher::set_global_default(Dispatch::new(subscriber()))
}

pub fn subscriber() -> impl tracing::Subscriber {
    let filtered = Registry::default()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")));

    let layer: BoxedLayer = match format() {
        LogFormat::Text => Box::new(text_layer(std::io::stdout)),
        LogFormat::Json => Box::new(json_layer(std::io::stdout)),
    };

    filtered.with(layer)
}

pub fn text_layer<S, W>(writer: W) -> impl Layer<S>
where
    S: tracing::Subscriber + for<'a> LookupSpan<'a>,
    W: for<'a> MakeWriter<'a> + Send + Sync + 'static,
{
    tracing_subscriber::fmt::layer()
        .with_target(false)
        .with_writer(writer)
}

pub fn json_layer<S, W>(writer: W) -> impl Layer<S>
where
    S: tracing::Subscriber + for<'a> LookupSpan<'a>,
    W: for<'a> MakeWriter<'a> + Send + Sync + 'static,
{
    tracing_subscriber::fmt::layer()
        .json()
        .flatten_event(true)
        .with_current_span(true)
        .with_span_list(false)
        .with_writer(writer)
}

#[cfg(test)]
mod tests {
    use super::LogFormat;

    #[test]
    fn unset_variable_selects_text() {
        assert_eq!(LogFormat::parse(None), LogFormat::Text);
    }

    #[test]
    fn json_selects_json() {
        assert_eq!(LogFormat::parse(Some("json")), LogFormat::Json);
    }

    #[test]
    fn value_is_case_and_whitespace_insensitive() {
        assert_eq!(LogFormat::parse(Some("  JSON \n")), LogFormat::Json);
    }

    #[test]
    fn unrecognised_value_falls_back_to_text() {
        assert_eq!(LogFormat::parse(Some("yaml")), LogFormat::Text);
    }

    #[test]
    fn empty_value_selects_text() {
        assert_eq!(LogFormat::parse(Some("")), LogFormat::Text);
    }
}
