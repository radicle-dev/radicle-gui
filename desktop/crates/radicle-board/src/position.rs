//! Fractional positions for ordering cards within a column.
//!
//! A position is a string of base-62 digits compared lexicographically. A card
//! is placed between two neighbours by generating a key that sorts between
//! their keys, so a move never rewrites the positions of other cards. Two
//! concurrent moves can produce the same key; ties are broken by card, which
//! every peer agrees on.

const DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE: usize = DIGITS.len();

fn digit(c: u8) -> Option<usize> {
    DIGITS.iter().position(|d| *d == c)
}

/// Whether `position` is a key this module could have generated.
///
/// Keys are non-empty, use only base-62 digits and never end in the zero
/// digit, which guarantees there is always room for a key before them.
pub fn is_valid(position: &str) -> bool {
    !position.is_empty() && position.bytes().all(|c| digit(c).is_some()) && !position.ends_with('0')
}

/// Generate a key that sorts strictly between `before` and `after`.
///
/// `None` stands for the start or the end of the column. Returns `None` when
/// either bound is not a valid key or when `before` does not sort before
/// `after`.
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

    String::from_utf8(key).ok()
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use super::{between, is_valid};

    #[test]
    fn first_key() {
        let key = between(None, None).unwrap();
        assert!(is_valid(&key));
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
        for _ in 0..200 {
            let (a, b) = (keys[10].clone(), keys[11].clone());
            keys.insert(11, between(Some(&a), Some(&b)).unwrap());
        }

        for pair in keys.windows(2) {
            assert!(pair[0] < pair[1], "{} < {}", pair[0], pair[1]);
        }
        assert!(keys.iter().all(|k| is_valid(k)));
    }

    #[test]
    fn adjacent_digits() {
        let key = between(Some("V"), Some("W")).unwrap();
        assert!("V" < key.as_str() && key.as_str() < "W");
    }

    #[test]
    fn rejects_invalid_bounds() {
        assert_eq!(between(Some("W"), Some("V")), None);
        assert_eq!(between(Some("V"), Some("V")), None);
        assert_eq!(between(Some("V0"), None), None);
        assert_eq!(between(Some("!"), None), None);
        assert_eq!(between(Some(""), None), None);
    }
}
