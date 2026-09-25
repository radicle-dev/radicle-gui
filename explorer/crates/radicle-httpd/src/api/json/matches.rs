use serde_json::{json, Value};

use radicle_search::query::{Formatted, MARK_CLOSE, MARK_OPEN};

/// Which set of fields a formatted payload carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    Cob,
    #[cfg_attr(not(feature = "artifacts"), allow(dead_code))]
    Release,
}

/// One run of text within a formatted field, flagged matched or not.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Segment {
    pub text: String,
    pub matched: bool,
}

fn push(out: &mut Vec<Segment>, text: &str, matched: bool) {
    let text = text.replace(MARK_CLOSE, "").replace(MARK_OPEN, "");
    if text.is_empty() {
        return;
    }
    if let Some(last) = out.last_mut() {
        if last.matched == matched {
            last.text.push_str(&text);
            return;
        }
    }
    out.push(Segment { text, matched });
}

/// Split a Meilisearch-formatted string into matched and unmatched runs.
/// Unpaired sentinels are dropped and their text kept, so a malformed payload
/// degrades to an unhighlighted result.
pub(crate) fn segments(formatted: &str) -> Vec<Segment> {
    let mut out = Vec::new();
    let mut rest = formatted;
    while let Some(open) = rest.find(MARK_OPEN) {
        let (before, from_open) = rest.split_at(open);
        push(&mut out, before, false);
        let after_open = &from_open[MARK_OPEN.len()..];
        match after_open.find(MARK_CLOSE) {
            Some(close) => {
                push(&mut out, &after_open[..close], true);
                rest = &after_open[close + MARK_CLOSE.len()..];
            }
            None => {
                push(&mut out, after_open, false);
                return out;
            }
        }
    }
    push(&mut out, rest, false);
    out
}

fn to_json(segments: &[Segment]) -> Value {
    Value::Array(
        segments
            .iter()
            .map(|s| json!({ "text": s.text, "match": s.matched }))
            .collect(),
    )
}

fn matched(segments: &[Segment]) -> bool {
    segments.iter().any(|s| s.matched)
}

fn context_fields(kind: Kind) -> &'static [(&'static str, bool)] {
    match kind {
        Kind::Cob => &[("description", false), ("comments", true)],
        Kind::Release => &[
            ("description", false),
            ("tagName", false),
            ("artifactNames", true),
        ],
    }
}

fn context(formatted: &Formatted, kind: Kind) -> Option<Value> {
    for (field, is_array) in context_fields(kind) {
        let candidates: Vec<&str> = if *is_array {
            match formatted.array(field) {
                Some(values) => values,
                None => continue,
            }
        } else {
            match formatted.text(field) {
                Some(text) => vec![text],
                None => continue,
            }
        };
        for candidate in candidates {
            let segments = segments(candidate);
            if matched(&segments) {
                return Some(json!({
                    "field": field,
                    "segments": to_json(&segments),
                }));
            }
        }
    }
    None
}

/// Build the `matches` object for one hit, or `None` when nothing visible
/// matched.
pub(crate) fn matches_json(formatted: &Formatted, kind: Kind) -> Option<Value> {
    let title = formatted.text("title").map(segments).filter(|s| matched(s));
    let context = context(formatted, kind);
    if title.is_none() && context.is_none() {
        return None;
    }
    let mut map = serde_json::Map::new();
    if let Some(title) = title {
        map.insert("title".to_string(), to_json(&title));
    }
    if let Some(context) = context {
        map.insert("context".to_string(), context);
    }
    Some(Value::Object(map))
}

#[cfg(test)]
mod tests {
    use super::*;
    use radicle_search::query::{Formatted, MARK_CLOSE, MARK_OPEN};

    fn texts(segments: &[Segment]) -> Vec<(&str, bool)> {
        segments
            .iter()
            .map(|s| (s.text.as_str(), s.matched))
            .collect()
    }

    #[test]
    fn segments_splits_on_sentinels() {
        assert_eq!(texts(&segments("plain text")), vec![("plain text", false)]);
        assert_eq!(
            texts(&segments(&format!("Crash on {MARK_OPEN}start{MARK_CLOSE}"))),
            vec![("Crash on ", false), ("start", true)]
        );
        assert_eq!(
            texts(&segments(&format!("{MARK_OPEN}all{MARK_CLOSE}"))),
            vec![("all", true)]
        );
        assert_eq!(
            texts(&segments(&format!(
                "{MARK_OPEN}a{MARK_CLOSE}{MARK_OPEN}b{MARK_CLOSE}"
            ))),
            vec![("ab", true)]
        );
        assert_eq!(
            texts(&segments(&format!(
                "émoji 🎉 {MARK_OPEN}ünïcode{MARK_CLOSE}"
            ))),
            vec![("émoji 🎉 ", false), ("ünïcode", true)]
        );
        assert_eq!(
            texts(&segments("…cropped both sides…")),
            vec![("…cropped both sides…", false)]
        );
    }

    #[test]
    fn segments_tolerates_unpaired_sentinels() {
        assert_eq!(
            texts(&segments(&format!("open {MARK_OPEN}but never closed"))),
            vec![("open but never closed", false)]
        );
        assert_eq!(
            texts(&segments(&format!("stray {MARK_CLOSE} close"))),
            vec![("stray  close", false)]
        );
        assert!(segments("").is_empty());
    }

    fn formatted(pairs: &[(&str, serde_json::Value)]) -> Formatted {
        let mut map = serde_json::Map::new();
        for (k, v) in pairs {
            map.insert(k.to_string(), v.clone());
        }
        Formatted::new(map)
    }

    #[test]
    fn matches_json_reports_a_title_hit() {
        let f = formatted(&[
            (
                "title",
                serde_json::json!(format!("Crash on {MARK_OPEN}start{MARK_CLOSE}")),
            ),
            ("description", serde_json::json!("nothing here")),
            ("comments", serde_json::json!([])),
        ]);
        let value = matches_json(&f, Kind::Cob).expect("matches");
        assert_eq!(
            value,
            serde_json::json!({
                "title": [
                    { "text": "Crash on ", "match": false },
                    { "text": "start", "match": true },
                ]
            })
        );
    }

    #[test]
    fn matches_json_reports_a_comment_hit_without_a_title() {
        let f = formatted(&[
            ("title", serde_json::json!("Crash on start")),
            ("description", serde_json::json!("nothing here")),
            (
                "comments",
                serde_json::json!([
                    "unrelated",
                    format!("…the {MARK_OPEN}readme{MARK_CLOSE} is wrong…")
                ]),
            ),
        ]);
        let value = matches_json(&f, Kind::Cob).expect("matches");
        assert_eq!(value.get("title"), None);
        assert_eq!(value["context"]["field"], serde_json::json!("comments"));
        assert_eq!(
            value["context"]["segments"],
            serde_json::json!([
                { "text": "…the ", "match": false },
                { "text": "readme", "match": true },
                { "text": " is wrong…", "match": false },
            ])
        );
    }

    #[test]
    fn matches_json_prefers_description_over_comments() {
        let f = formatted(&[
            ("title", serde_json::json!("Crash on start")),
            (
                "description",
                serde_json::json!(format!("a {MARK_OPEN}hit{MARK_CLOSE}")),
            ),
            (
                "comments",
                serde_json::json!([format!("{MARK_OPEN}hit{MARK_CLOSE}")]),
            ),
        ]);
        let value = matches_json(&f, Kind::Cob).expect("matches");
        assert_eq!(value["context"]["field"], serde_json::json!("description"));
    }

    #[test]
    fn matches_json_is_none_without_any_match() {
        let f = formatted(&[
            ("title", serde_json::json!("Crash on start")),
            ("description", serde_json::json!("nothing here")),
            ("comments", serde_json::json!(["nor here"])),
        ]);
        assert!(matches_json(&f, Kind::Cob).is_none());
    }

    #[test]
    fn matches_json_gives_no_context_for_a_did_only_hit() {
        // `dids` is never requested for highlighting, so a hit matched only on
        // a participant DID arrives with no sentinels in any visible field.
        let f = formatted(&[
            ("title", serde_json::json!("Crash on start")),
            ("description", serde_json::json!("nothing here")),
            ("comments", serde_json::json!([])),
            (
                "dids",
                serde_json::json!([format!("{MARK_OPEN}did:key:z6Mk{MARK_CLOSE}")]),
            ),
        ]);
        assert!(matches_json(&f, Kind::Cob).is_none());
    }

    #[test]
    fn matches_json_survives_missing_or_mistyped_fields() {
        let f = formatted(&[("description", serde_json::json!(42))]);
        assert!(matches_json(&f, Kind::Cob).is_none());
        assert!(matches_json(&Formatted::new(serde_json::Map::new()), Kind::Cob).is_none());
    }

    #[test]
    fn matches_json_uses_release_fields() {
        let f = formatted(&[
            ("title", serde_json::json!("v1.0")),
            ("tagName", serde_json::json!("v1.0")),
            ("description", serde_json::json!("nothing")),
            (
                "artifactNames",
                serde_json::json!([format!("linux-{MARK_OPEN}amd64{MARK_CLOSE}")]),
            ),
        ]);
        let value = matches_json(&f, Kind::Release).expect("matches");
        assert_eq!(
            value["context"]["field"],
            serde_json::json!("artifactNames")
        );
    }
}
