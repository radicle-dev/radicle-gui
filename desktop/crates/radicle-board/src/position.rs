//! Fractional positions for ordering cards within a column: base-62 strings
//! compared lexicographically. A card is placed between two neighbours by
//! generating a key that sorts between theirs, so a move never rewrites
//! other cards' positions.

const DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE: usize = DIGITS.len();

fn digit(c: u8) -> Option<usize> {
    DIGITS.iter().position(|d| *d == c)
}

/// Keys never end in the zero digit, which guarantees there is always room
/// for a key before them.
pub fn is_valid(position: &str) -> bool {
    !position.is_empty() && position.bytes().all(|c| digit(c).is_some()) && !position.ends_with('0')
}

/// A key that sorts strictly between `before` and `after`, where `None` is
/// the start or end of the column. `None` when a bound is invalid or `before`
/// does not sort before `after`.
pub fn between(before: Option<&str>, after: Option<&str>) -> Option<String> {
    if before.is_some_and(|b| !is_valid(b)) || after.is_some_and(|a| !is_valid(a)) {
        return None;
    }
    if let (Some(b), Some(a)) = (before, after)
        && b >= a
    {
        return None;
    }

    let low = before.unwrap_or("").as_bytes();
    let mut high = after.map(str::as_bytes);
    let mut key = Vec::new();

    for i in 0.. {
        let lo = low.get(i).and_then(|c| digit(*c)).unwrap_or(0);
        let hi = match high {
            Some(h) => h.get(i).and_then(|c| digit(*c)).unwrap_or(0),
            None => BASE,
        };

        if hi > lo + 1 {
            key.push(DIGITS[(lo + hi) / 2]);
            break;
        }
        key.push(DIGITS[lo]);
        if hi == lo + 1 {
            // Every key with this prefix already sorts below `high`, so the
            // remaining digits are only bounded by `low`.
            high = None;
        }
    }

    if key.len() > crate::MAX_POSITION_LEN {
        return None;
    }
    String::from_utf8(key).ok()
}

/// The bounds for a new key at `index` among `positions`, which are in column
/// order. Neighbours that share a key leave no room between them, so the new
/// key goes just after the upper one and stays below the next distinct key.
pub fn neighbours<'a>(positions: &[&'a str], index: usize) -> (Option<&'a str>, Option<&'a str>) {
    let before = index.checked_sub(1).and_then(|i| positions.get(i).copied());
    let after = positions.get(index).copied();
    match (before, after) {
        (Some(b), Some(a)) if b >= a => {
            let next = positions[index..].iter().copied().find(|p| *p > b);
            (Some(b), next)
        }
        _ => (before, after),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use serde::Deserialize;

    use super::{between, is_valid, neighbours};

    // Shared with the TypeScript implementation, which reads the same file,
    // so that both generate identical keys.
    const FIXTURE: &str = include_str!("../tests/fixtures/positions.json");

    #[derive(Deserialize)]
    struct Fixture {
        between: Vec<Between>,
        neighbours: Vec<Neighbours>,
    }

    #[derive(Deserialize)]
    struct Between {
        before: Option<String>,
        after: Option<String>,
        key: Option<String>,
    }

    #[derive(Deserialize)]
    struct Neighbours {
        positions: Vec<String>,
        index: usize,
        before: Option<String>,
        after: Option<String>,
        key: Option<String>,
    }

    fn fixture() -> Fixture {
        serde_json::from_str(FIXTURE).unwrap()
    }

    #[test]
    fn between_matches_the_fixture() {
        for case in fixture().between {
            assert_eq!(
                between(case.before.as_deref(), case.after.as_deref()),
                case.key,
                "between({:?}, {:?})",
                case.before,
                case.after
            );
        }
    }

    #[test]
    fn neighbours_match_the_fixture() {
        for case in fixture().neighbours {
            let positions: Vec<&str> = case.positions.iter().map(String::as_str).collect();
            let (before, after) = neighbours(&positions, case.index);
            assert_eq!(
                (before, after),
                (case.before.as_deref(), case.after.as_deref()),
                "neighbours({:?}, {})",
                case.positions,
                case.index
            );
            assert_eq!(between(before, after), case.key);
        }
    }

    #[test]
    fn keys_sort_between_their_bounds() {
        let mut keys = vec![between(None, None).unwrap()];
        for _ in 0..200 {
            let last = keys.last().unwrap().clone();
            keys.push(between(Some(&last), None).unwrap());
        }
        for _ in 0..200 {
            let first = keys.first().unwrap().clone();
            keys.insert(0, between(None, Some(&first)).unwrap());
        }
        for _ in 0..100 {
            let (a, b) = (keys[10].clone(), keys[11].clone());
            keys.insert(11, between(Some(&a), Some(&b)).unwrap());
        }

        for pair in keys.windows(2) {
            assert!(pair[0] < pair[1], "{} < {}", pair[0], pair[1]);
        }
        assert!(keys.iter().all(|k| is_valid(k)));
    }
}
