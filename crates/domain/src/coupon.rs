//! Coupon rules, ported from the Bun panel handlers.
//!
//! The dashboard edits coupon dates with a day picker, so the validity window
//! is a pair of calendar days: a coupon ending "31/10" runs through the end of
//! 31/10. Both ends are therefore widened to the day boundary unless the input
//! already carries a time.
//!
//! `expired` is derived from that window, never chosen: the panel switch sends
//! only `active` or `disabled`, and a coupon whose window has closed reads as
//! expired whatever the column says. A stored `disabled` outranks the window —
//! the merchant turned it off — and a legacy row already stored as `expired`
//! stays expired.
//!
//! Timestamps here are UTC wall clock, formatted `YYYY-MM-DDTHH:MM:SS.mmm`.
//! Fixed width is what lets the comparisons be plain string comparisons; the
//! handler normalizes, so this module needs no clock or calendar of its own.

/// `%Y-%m-%d` has ten bytes, the only input shape that is widened.
const DATE_ONLY_LEN: usize = 10;

/// Where a coupon stands after the stored status meets its window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CouponStatus {
    Active,
    Expired,
    Disabled,
}

/// The two states the write path accepts; `expired` is never chosen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CouponWriteStatus {
    Active,
    Disabled,
}

/// How `value` is read: cents for a fixed discount, whole percent otherwise.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscountType {
    Percentage,
    Fixed,
}

/// A coupon window after both ends were widened to their day boundary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CouponWindow {
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
}

/// Why a window was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CouponRuleError {
    /// An end or start was not a date or a naive date-time.
    InvalidTimestamp,
    /// The window opens after it closes.
    StartsAfterEnds,
}

/// Start of the day the member picked; a timestamp keeps its own time.
pub fn start_of_window(value: Option<&str>) -> Result<Option<String>, CouponRuleError> {
    let Some(value) = present(value) else {
        return Ok(None);
    };

    let normalized = normalize(value)?;

    Ok(Some(if is_date_only(value) {
        format!("{}T00:00:00.000", &normalized[..DATE_ONLY_LEN])
    } else {
        normalized
    }))
}

/// End of the day the member picked, so the last chosen day stays usable.
pub fn end_of_window(value: Option<&str>) -> Result<Option<String>, CouponRuleError> {
    let Some(value) = present(value) else {
        return Ok(None);
    };

    let normalized = normalize(value)?;

    Ok(Some(if is_date_only(value) {
        format!("{}T23:59:59.999", &normalized[..DATE_ONLY_LEN])
    } else {
        normalized
    }))
}

/// Both ends, refusing a window that opens after it closes.
pub fn coupon_window(
    starts_at: Option<&str>,
    ends_at: Option<&str>,
) -> Result<CouponWindow, CouponRuleError> {
    let start = start_of_window(starts_at)?;
    let end = end_of_window(ends_at)?;

    if let (Some(start), Some(end)) = (&start, &end)
        && start > end
    {
        return Err(CouponRuleError::StartsAfterEnds);
    }

    Ok(CouponWindow {
        starts_at: start,
        ends_at: end,
    })
}

/// The status a write stores: `expired` once the window has closed.
pub fn resolve_coupon_status(
    requested: CouponWriteStatus,
    ends_at: Option<&str>,
    now: &str,
) -> Result<CouponStatus, CouponRuleError> {
    let end = end_of_window(ends_at)?;
    let now = normalize(now)?;

    Ok(match (requested, end) {
        (CouponWriteStatus::Disabled, _) => CouponStatus::Disabled,
        (CouponWriteStatus::Active, Some(end)) if end < now => CouponStatus::Expired,
        _ => CouponStatus::Active,
    })
}

/// How a stored status reads today. A stored `disabled` outranks the window.
pub fn effective_coupon_status(
    stored: CouponStatus,
    ends_at: Option<&str>,
    now: &str,
) -> Result<CouponStatus, CouponRuleError> {
    if stored != CouponStatus::Active {
        return Ok(stored);
    }

    let end = end_of_window(ends_at)?;
    let now = normalize(now)?;

    Ok(match end {
        Some(end) if end < now => CouponStatus::Expired,
        _ => CouponStatus::Active,
    })
}

/// Splits the single `value` column into the two fields the panel carries.
pub fn coupon_values(discount: DiscountType, value: i64) -> (Option<i64>, Option<i64>) {
    match discount {
        DiscountType::Fixed => (Some(value), None),
        DiscountType::Percentage => (None, Some(value)),
    }
}

/// What a deletion did: linked coupons are archived, the rest removed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CouponDeleteOutcome {
    Deleted,
    Archived,
}

/// An order or a redemption that names the coupon keeps it on the books.
pub fn coupon_delete_outcome(linked: bool) -> CouponDeleteOutcome {
    if linked {
        CouponDeleteOutcome::Archived
    } else {
        CouponDeleteOutcome::Deleted
    }
}

/// One grouped `(couponId, customerId)` row: a customer's uses of one coupon.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedemptionRow {
    pub coupon_id: String,
    pub redemptions: i64,
    pub discount_cents: i64,
    pub last_redeemed_at: Option<String>,
    pub first_redeemed_at: Option<String>,
}

/// One coupon's totals across every customer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedemptionAggregate {
    pub coupon_id: String,
    pub redemptions: i64,
    pub discount_cents: i64,
    pub customers: i64,
    pub last_redeemed_at: Option<String>,
    pub first_redeemed_at: Option<String>,
}

/// Folds the grouped rows per coupon.
///
/// Grouping by `(couponId, customerId)` is what lets the database count: each
/// row is one customer's use of one coupon, already summed by SQL. Folding
/// those rows is bounded by customers, not by redemptions.
pub fn aggregate_redemptions(rows: &[RedemptionRow]) -> Vec<RedemptionAggregate> {
    let mut aggregates: Vec<RedemptionAggregate> = Vec::new();

    for row in rows {
        let Some(current) = aggregates
            .iter_mut()
            .find(|aggregate| aggregate.coupon_id == row.coupon_id)
        else {
            aggregates.push(RedemptionAggregate {
                coupon_id: row.coupon_id.clone(),
                redemptions: row.redemptions,
                discount_cents: row.discount_cents,
                customers: 1,
                last_redeemed_at: row.last_redeemed_at.clone(),
                first_redeemed_at: row.first_redeemed_at.clone(),
            });

            continue;
        };

        current.redemptions += row.redemptions;
        current.discount_cents += row.discount_cents;
        current.customers += 1;
        current.last_redeemed_at = latest(
            current.last_redeemed_at.take(),
            row.last_redeemed_at.clone(),
        );
        current.first_redeemed_at = earliest(
            current.first_redeemed_at.take(),
            row.first_redeemed_at.clone(),
        );
    }

    aggregates
}

/// One distinct redemption timestamp, as the SQL groups it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsageRow {
    pub created_at: String,
    pub redemptions: i64,
    pub discount_cents: i64,
}

/// One UTC day of the usage series.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsagePoint {
    pub bucket: String,
    pub redemptions: i64,
    pub discount_cents: i64,
}

/// Folds the timestamp rows into days, dropping days without a redemption.
///
/// Empty days are omitted, not zero-filled: the chart marks its range from the
/// first and last bucket it receives, so a gap stays a gap.
pub fn usage_series(rows: &[UsageRow]) -> Vec<UsagePoint> {
    let mut points: Vec<UsagePoint> = Vec::new();

    for row in rows {
        let bucket = row
            .created_at
            .get(..DATE_ONLY_LEN)
            .unwrap_or(&row.created_at);

        match points.iter_mut().find(|point| point.bucket == bucket) {
            Some(point) => {
                point.redemptions += row.redemptions;
                point.discount_cents += row.discount_cents;
            }
            None => points.push(UsagePoint {
                bucket: bucket.to_owned(),
                redemptions: row.redemptions,
                discount_cents: row.discount_cents,
            }),
        }
    }

    points.sort_by(|left, right| left.bucket.cmp(&right.bucket));

    points
}

/// The trimmed value, with `None` and `""` both meaning "not set".
fn present(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn is_date_only(value: &str) -> bool {
    value.len() == DATE_ONLY_LEN
}

/// `YYYY-MM-DD[THH:MM[:SS[.mmm]]]` to fixed-width wall clock, or `None`.
fn normalize(value: &str) -> Result<String, CouponRuleError> {
    invalid_if(value.get(..DATE_ONLY_LEN).is_none_or(|date| {
        let bytes = date.as_bytes();

        bytes[4] != b'-' || bytes[7] != b'-'
    }))?;

    let date = &value[..DATE_ONLY_LEN];
    let year = number(&date[0..4])?;
    let month = number(&date[5..7])?;
    let day = number(&date[8..10])?;

    if year == 0 || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return Err(CouponRuleError::InvalidTimestamp);
    }

    let rest = &value[DATE_ONLY_LEN..];

    if rest.is_empty() {
        return Ok(format!("{date}T00:00:00.000"));
    }

    let rest = rest
        .strip_prefix('T')
        .or_else(|| rest.strip_prefix(' '))
        .ok_or(CouponRuleError::InvalidTimestamp)?;

    let mut parts = rest.split(':');
    let hour = number(parts.next().unwrap_or(""))?;
    let minute = number(parts.next().unwrap_or(""))?;
    let seconds = parts.next().unwrap_or("0");

    if parts.next().is_some() || hour > 23 || minute > 59 {
        return Err(CouponRuleError::InvalidTimestamp);
    }

    let (second, millis) = match seconds.split_once('.') {
        Some((second, fraction)) => {
            let fraction = fraction.get(..3).unwrap_or(fraction);
            let millis = format!("{fraction:0<3}");

            (second, number(&millis)?)
        }
        None => (seconds, 0),
    };

    let second = number(second)?;

    if second > 59 || millis > 999 {
        return Err(CouponRuleError::InvalidTimestamp);
    }

    Ok(format!(
        "{date}T{hour:02}:{minute:02}:{second:02}.{millis:03}"
    ))
}

fn number(value: &str) -> Result<u32, CouponRuleError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(CouponRuleError::InvalidTimestamp);
    }

    value.parse().map_err(|_| CouponRuleError::InvalidTimestamp)
}

fn invalid_if(condition: bool) -> Result<(), CouponRuleError> {
    if condition {
        return Err(CouponRuleError::InvalidTimestamp);
    }

    Ok(())
}

/// The later of two formatted timestamps.
fn latest(left: Option<String>, right: Option<String>) -> Option<String> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (left, right) => left.or(right),
    }
}

/// The earlier of two formatted timestamps.
fn earliest(left: Option<String>, right: Option<String>) -> Option<String> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.min(right)),
        (left, right) => left.or(right),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bare_date_is_widened_to_the_day_boundary() {
        assert_eq!(
            start_of_window(Some("2026-10-01")).unwrap().as_deref(),
            Some("2026-10-01T00:00:00.000")
        );
        assert_eq!(
            end_of_window(Some("2026-10-31")).unwrap().as_deref(),
            Some("2026-10-31T23:59:59.999")
        );
    }

    #[test]
    fn a_timestamp_is_taken_at_its_word() {
        let window = coupon_window(Some("2026-10-01T08:30"), Some("2026-10-31T18:00:00.5"))
            .expect("a closed window");

        assert_eq!(window.starts_at.as_deref(), Some("2026-10-01T08:30:00.000"));
        assert_eq!(window.ends_at.as_deref(), Some("2026-10-31T18:00:00.500"));
    }

    #[test]
    fn an_empty_end_is_no_end() {
        let window = coupon_window(None, Some("  ")).expect("no window");

        assert_eq!(window.starts_at, None);
        assert_eq!(window.ends_at, None);
    }

    #[test]
    fn a_window_that_opens_after_it_closes_is_refused() {
        assert_eq!(
            coupon_window(Some("2026-11-02"), Some("2026-11-01")),
            Err(CouponRuleError::StartsAfterEnds)
        );
    }

    #[test]
    fn garbage_is_refused() {
        for value in ["2026-13-01", "2026-10-32", "2026-10-01T25:00", "31/10/2026"] {
            assert_eq!(
                start_of_window(Some(value)),
                Err(CouponRuleError::InvalidTimestamp),
                "{value}"
            );
        }
    }

    #[test]
    fn the_last_day_still_activates_and_the_next_day_expires() {
        assert_eq!(
            resolve_coupon_status(
                CouponWriteStatus::Active,
                Some("2026-10-31"),
                "2026-10-31T23:59:59.999",
            ),
            Ok(CouponStatus::Active)
        );
        assert_eq!(
            resolve_coupon_status(
                CouponWriteStatus::Active,
                Some("2026-10-31"),
                "2026-11-01T00:00:00.000",
            ),
            Ok(CouponStatus::Expired)
        );
    }

    #[test]
    fn disabled_is_written_as_is_and_a_coupon_without_an_end_stays_active() {
        assert_eq!(
            resolve_coupon_status(
                CouponWriteStatus::Disabled,
                Some("2020-01-01"),
                "2026-11-02"
            ),
            Ok(CouponStatus::Disabled)
        );
        assert_eq!(
            resolve_coupon_status(CouponWriteStatus::Active, None, "2026-11-02"),
            Ok(CouponStatus::Active)
        );
    }

    #[test]
    fn a_stored_disabled_outranks_the_window() {
        assert_eq!(
            effective_coupon_status(CouponStatus::Disabled, Some("2020-01-01"), "2026-11-02"),
            Ok(CouponStatus::Disabled)
        );
        assert_eq!(
            effective_coupon_status(CouponStatus::Expired, Some("2027-01-01"), "2026-11-02"),
            Ok(CouponStatus::Expired)
        );
        assert_eq!(
            effective_coupon_status(CouponStatus::Active, Some("2026-11-01"), "2026-11-02"),
            Ok(CouponStatus::Expired)
        );
    }

    #[test]
    fn the_value_column_splits_by_discount_type() {
        assert_eq!(coupon_values(DiscountType::Fixed, 1500), (Some(1500), None));
        assert_eq!(
            coupon_values(DiscountType::Percentage, 15),
            (None, Some(15))
        );
    }

    #[test]
    fn linked_coupons_are_archived_and_the_rest_deleted() {
        assert_eq!(coupon_delete_outcome(true), CouponDeleteOutcome::Archived);
        assert_eq!(coupon_delete_outcome(false), CouponDeleteOutcome::Deleted);
    }

    #[test]
    fn redemption_rows_fold_per_coupon() {
        let rows = vec![
            RedemptionRow {
                coupon_id: "a".to_owned(),
                redemptions: 2,
                discount_cents: 500,
                last_redeemed_at: Some("2026-10-02T10:00:00.000Z".to_owned()),
                first_redeemed_at: Some("2026-10-01T10:00:00.000Z".to_owned()),
            },
            RedemptionRow {
                coupon_id: "a".to_owned(),
                redemptions: 1,
                discount_cents: 250,
                last_redeemed_at: Some("2026-10-03T10:00:00.000Z".to_owned()),
                first_redeemed_at: Some("2026-09-30T10:00:00.000Z".to_owned()),
            },
            RedemptionRow {
                coupon_id: "b".to_owned(),
                redemptions: 4,
                discount_cents: 900,
                last_redeemed_at: None,
                first_redeemed_at: None,
            },
        ];

        let folded = aggregate_redemptions(&rows);

        assert_eq!(
            folded,
            vec![
                RedemptionAggregate {
                    coupon_id: "a".to_owned(),
                    redemptions: 3,
                    discount_cents: 750,
                    customers: 2,
                    last_redeemed_at: Some("2026-10-03T10:00:00.000Z".to_owned()),
                    first_redeemed_at: Some("2026-09-30T10:00:00.000Z".to_owned()),
                },
                RedemptionAggregate {
                    coupon_id: "b".to_owned(),
                    redemptions: 4,
                    discount_cents: 900,
                    customers: 1,
                    last_redeemed_at: None,
                    first_redeemed_at: None,
                },
            ]
        );
    }

    #[test]
    fn usage_folds_into_days_and_omits_empty_ones() {
        let points = usage_series(&[
            UsageRow {
                created_at: "2026-10-02T10:00:00".to_owned(),
                redemptions: 2,
                discount_cents: 300,
            },
            UsageRow {
                created_at: "2026-10-02T18:00:00".to_owned(),
                redemptions: 1,
                discount_cents: 100,
            },
            UsageRow {
                created_at: "2026-10-05T09:00:00".to_owned(),
                redemptions: 1,
                discount_cents: 50,
            },
        ]);

        assert_eq!(
            points,
            vec![
                UsagePoint {
                    bucket: "2026-10-02".to_owned(),
                    redemptions: 3,
                    discount_cents: 400,
                },
                UsagePoint {
                    bucket: "2026-10-05".to_owned(),
                    redemptions: 1,
                    discount_cents: 50,
                },
            ]
        );
    }
}
