//! Palette ranking, ported from `panel/search-rank.ts`.
//!
//! Matching is already done by `ILIKE` in Postgres; this only decides the order
//! of the few rows that came back. Prefix matches first, then a pt-BR
//! alphabetical order, then the id. Accent folding is deliberately not done on
//! the comparison itself: `ILIKE` does not fold accents either, so the ranking
//! would disagree with the filter.

use std::cmp::Ordering;

/// Compares two palette rows for the query `q`.
///
/// Each side is `(label, id)`: the text the caller typed against and the
/// tiebreak that keeps the page stable. The chain is the TS one: prefix rank,
/// then the labels in pt-BR order, then the ids.
pub fn compare(left: (&str, &str), right: (&str, &str), q: &str) -> Ordering {
    let term = normalized(q);

    prefix_rank(left.0, &term)
        .cmp(&prefix_rank(right.0, &term))
        .then_with(|| collate(left.0, right.0))
        .then_with(|| collate(left.1, right.1))
}

/// `0` when the label starts with the term, `1` otherwise.
fn prefix_rank(label: &str, term: &str) -> u8 {
    if normalized(label).starts_with(term) {
        0
    } else {
        1
    }
}

/// Lowercase, the way `toLocaleLowerCase("pt-BR")` did for the labels.
fn normalized(value: &str) -> String {
    value.to_lowercase()
}

/// Labels in pt-BR order: accent-insensitive primary weights first, then the
/// accented form after the plain one (`a` before `á`, both before `b`).
fn collate(left: &str, right: &str) -> Ordering {
    let left = normalized(left);
    let right = normalized(right);

    folded(&left)
        .cmp(&folded(&right))
        .then_with(|| left.cmp(&right))
}

/// Replaces the Portuguese accented letters with their base letter: the
/// primary weight a pt-BR collation compares on.
fn folded(value: &str) -> String {
    value.chars().map(fold).collect()
}

/// One character at its primary weight; anything else is already its base.
fn fold(value: char) -> char {
    match value {
        'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use std::cmp::Ordering;

    use super::compare;

    /// The rows sorted the way a handler sorts them, as their labels.
    fn ranked(mut items: Vec<(&'static str, &'static str)>, q: &str) -> Vec<&'static str> {
        items.sort_by(|left, right| compare(*left, *right, q));

        items.into_iter().map(|item| item.0).collect()
    }

    #[test]
    fn a_prefix_match_sorts_before_a_match_in_the_middle() {
        assert_eq!(
            ranked(vec![("Fubá com bolo", "1"), ("Bolo", "2")], "bolo"),
            vec!["Bolo", "Fubá com bolo"]
        );
    }

    #[test]
    fn the_query_is_case_insensitive_on_both_sides() {
        assert_eq!(
            ranked(vec![("Outro", "1"), ("BOLO de fubá", "2")], "bOlO"),
            vec!["BOLO de fubá", "Outro"]
        );
    }

    #[test]
    fn labels_sort_alphabetically_when_neither_is_a_prefix() {
        assert_eq!(
            ranked(vec![("Broa", "1"), ("Água", "2"), ("Aveia", "3")], "zzz"),
            vec!["Água", "Aveia", "Broa"]
        );
    }

    #[test]
    fn an_empty_query_ranks_every_row_the_same() {
        assert_eq!(
            ranked(vec![("Broa", "1"), ("Água", "2"), ("Aveia", "3")], ""),
            vec!["Água", "Aveia", "Broa"]
        );
    }

    #[test]
    fn the_accented_form_sorts_after_the_plain_one() {
        assert_eq!(
            ranked(vec![("Água", "1"), ("Agua", "2"), ("Azedo", "3")], ""),
            vec!["Agua", "Água", "Azedo"]
        );
    }

    #[test]
    fn equal_labels_are_ordered_by_id() {
        assert_eq!(
            ranked(vec![("Bolo", "b"), ("Bolo", "a")], "bolo"),
            vec!["Bolo", "Bolo"]
        );

        let mut items = vec![("Bolo", "b"), ("Bolo", "a")];
        items.sort_by(|left, right| compare(*left, *right, "bolo"));

        assert_eq!(items, vec![("Bolo", "a"), ("Bolo", "b")]);
    }

    #[test]
    fn two_rows_that_match_every_key_compare_equal() {
        assert_eq!(
            compare(("Bolo", "1"), ("Bolo", "1"), "bolo"),
            Ordering::Equal
        );
    }
}
