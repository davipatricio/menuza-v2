//! coupons resource queries, ported from the Bun panel handlers.
//!
//! `value` is one column with two meanings — cents for a fixed discount, whole
//! percent for a percentage one — so the reads return it whole and the caller
//! splits it.
//!
//! Deleting a coupon checks the ledger first: an order or a redemption that
//! names it keeps the rows, so the coupon is archived instead of removed. The
//! check and the write share one transaction, and a bulk call rolls back whole
//! when one id is not the store's.

use chrono::NaiveDateTime;
use domain::coupon::{CouponDeleteOutcome, UsageRow, coupon_delete_outcome};
use sqlx::{PgConnection, PgPool};

use crate::tenant::{TenantId, begin_scoped};

/// One coupon row as every read sees it.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CouponRow {
    pub id: String,
    pub code: String,
    pub description: Option<String>,
    #[sqlx(rename = "discount_type")]
    pub discount_type: String,
    pub value: i32,
    #[sqlx(rename = "usage_count")]
    pub usage_count: i32,
    #[sqlx(rename = "usage_limit")]
    pub usage_limit: Option<i32>,
    #[sqlx(rename = "per_customer_limit")]
    pub per_customer_limit: Option<i32>,
    #[sqlx(rename = "minimum_order_cents")]
    pub minimum_order_cents: Option<i32>,
    #[sqlx(rename = "maximum_discount_cents")]
    pub maximum_discount_cents: Option<i32>,
    #[sqlx(rename = "shipping_discount_percent")]
    pub shipping_discount_percent: Option<i32>,
    #[sqlx(rename = "starts_at")]
    pub starts_at: Option<NaiveDateTime>,
    #[sqlx(rename = "ends_at")]
    pub ends_at: Option<NaiveDateTime>,
    pub stackable: bool,
    #[sqlx(rename = "first_purchase_only")]
    pub first_purchase_only: bool,
    pub status: String,
    #[sqlx(rename = "product_scope_mode")]
    pub product_scope_mode: String,
}

/// One coupon → product link.
pub struct CouponLink {
    pub coupon_id: String,
    pub product_id: String,
}

/// A product named by a coupon's scope.
pub struct CouponProduct {
    pub id: String,
    pub name: String,
}

/// The fields every coupon write carries.
pub struct CouponWrite<'a> {
    pub code: &'a str,
    pub description: Option<&'a str>,
    pub discount_type: &'a str,
    pub value: i32,
    pub status: &'a str,
    pub product_scope_mode: &'a str,
    pub starts_at: Option<NaiveDateTime>,
    pub ends_at: Option<NaiveDateTime>,
    pub usage_limit: Option<i32>,
    pub per_customer_limit: Option<i32>,
    pub minimum_order_cents: Option<i32>,
    pub maximum_discount_cents: Option<i32>,
    pub shipping_discount_percent: Option<i32>,
    pub stackable: bool,
    pub first_purchase_only: bool,
    pub product_ids: &'a [String],
}

/// One `(couponId, customerId)` grouped redemption row: a customer's uses of
/// one coupon, already summed and timestamped by SQL.
pub struct RedemptionPair {
    pub coupon_id: String,
    pub redemptions: i64,
    pub discount_cents: i64,
    pub last_redeemed_at: NaiveDateTime,
    pub first_redeemed_at: NaiveDateTime,
}

/// One redemption row of the detail history, joined to its customer and order.
pub struct CouponRedemptionRow {
    pub id: String,
    pub discount_cents: i32,
    pub created_at: NaiveDateTime,
    pub customer_id: String,
    pub customer_name: String,
    pub customer_email: String,
    pub order_id: String,
    pub order_code: String,
    pub order_total_cents: i32,
    pub order_created_at: NaiveDateTime,
}

const COUPON_COLUMNS: &str = r#"id, code, description,
       "discountType" AS discount_type, value,
       "usageCount" AS usage_count, "usageLimit" AS usage_limit,
       "perCustomerLimit" AS per_customer_limit,
       "minimumOrderCents" AS minimum_order_cents,
       "maximumDiscountCents" AS maximum_discount_cents,
       "shippingDiscountPercent" AS shipping_discount_percent,
       "startsAt" AS starts_at, "endsAt" AS ends_at,
       stackable, "firstPurchaseOnly" AS first_purchase_only,
       status, "productScopeMode" AS product_scope_mode"#;

/// The store's live coupons, in code order.
pub async fn coupon_list(pool: &PgPool, tenant: &TenantId) -> Result<Vec<CouponRow>, sqlx::Error> {
    let sql = format!(
        r#"SELECT {COUPON_COLUMNS}
             FROM "Coupon"
            WHERE "tenantId" = $1 AND "deletedAt" IS NULL
            ORDER BY code ASC, id ASC"#
    );

    sqlx::query_as::<_, CouponRow>(sqlx::AssertSqlSafe(sql))
        .bind(tenant.as_str())
        .fetch_all(pool)
        .await
}

/// One live coupon of the store, or `None`.
pub async fn coupon_find(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
) -> Result<Option<CouponRow>, sqlx::Error> {
    let sql = format!(
        r#"SELECT {COUPON_COLUMNS}
             FROM "Coupon"
            WHERE "tenantId" = $1 AND id = $2 AND "deletedAt" IS NULL"#
    );

    sqlx::query_as::<_, CouponRow>(sqlx::AssertSqlSafe(sql))
        .bind(tenant.as_str())
        .bind(coupon_id)
        .fetch_optional(pool)
        .await
}

/// Whether any coupon — archived rows included — already holds this code.
pub async fn coupon_code_taken(
    pool: &PgPool,
    tenant: &TenantId,
    code: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Coupon" WHERE "tenantId" = $1 AND code = $2"#,
    )
    .bind(tenant.as_str())
    .bind(code)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// Every product link of the given coupons.
pub async fn coupon_links(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_ids: &[String],
) -> Result<Vec<CouponLink>, sqlx::Error> {
    if coupon_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query_as::<_, (String, String)>(
        r#"SELECT "couponId", "productId"
             FROM "CouponProduct"
            WHERE "tenantId" = $1 AND "couponId" = ANY($2)
            ORDER BY "productId" ASC"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_ids.to_vec())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| CouponLink {
            coupon_id: row.0,
            product_id: row.1,
        })
        .collect())
}

/// The products a coupon is scoped to, by name.
pub async fn coupon_products(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
) -> Result<Vec<CouponProduct>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, String)>(
        r#"SELECT p.id, p.name
             FROM "CouponProduct" cp
             JOIN "Product" p
               ON p.id = cp."productId" AND p."tenantId" = cp."tenantId"
            WHERE cp."tenantId" = $1 AND cp."couponId" = $2
            ORDER BY p.name ASC, p.id ASC"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| CouponProduct {
            id: row.0,
            name: row.1,
        })
        .collect())
}

/// Creates the coupon and its product links. `false` means a listed product is
/// not the store's; the transaction then rolls back untouched.
pub async fn coupon_create(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
    write: &CouponWrite<'_>,
) -> Result<bool, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    if !products_owned(&mut tx, tenant, write.product_ids).await? {
        return Ok(false);
    }

    sqlx::query(
        r#"INSERT INTO "Coupon"
               (id, "tenantId", code, description, "discountType", value, status,
                "productScopeMode", "startsAt", "endsAt", "usageLimit",
                "perCustomerLimit", "minimumOrderCents", "maximumDiscountCents",
                "shippingDiscountPercent", stackable, "firstPurchaseOnly")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)"#,
    )
    .bind(coupon_id)
    .bind(tenant.as_str())
    .bind(write.code)
    .bind(write.description)
    .bind(write.discount_type)
    .bind(write.value)
    .bind(write.status)
    .bind(write.product_scope_mode)
    .bind(write.starts_at)
    .bind(write.ends_at)
    .bind(write.usage_limit)
    .bind(write.per_customer_limit)
    .bind(write.minimum_order_cents)
    .bind(write.maximum_discount_cents)
    .bind(write.shipping_discount_percent)
    .bind(write.stackable)
    .bind(write.first_purchase_only)
    .execute(&mut **tx)
    .await?;

    link_products(&mut tx, tenant, coupon_id, write.product_ids).await?;

    tx.commit().await?;

    Ok(true)
}

/// Replaces every field and the whole product scope. `false` means a listed
/// product is not the store's.
pub async fn coupon_update(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
    write: &CouponWrite<'_>,
) -> Result<bool, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    if !products_owned(&mut tx, tenant, write.product_ids).await? {
        return Ok(false);
    }

    sqlx::query(
        r#"UPDATE "Coupon"
              SET code = $3, description = $4, "discountType" = $5, value = $6,
                  status = $7, "productScopeMode" = $8, "startsAt" = $9,
                  "endsAt" = $10, "usageLimit" = $11, "perCustomerLimit" = $12,
                  "minimumOrderCents" = $13, "maximumDiscountCents" = $14,
                  "shippingDiscountPercent" = $15, stackable = $16,
                  "firstPurchaseOnly" = $17
            WHERE "tenantId" = $1 AND id = $2 AND "deletedAt" IS NULL"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .bind(write.code)
    .bind(write.description)
    .bind(write.discount_type)
    .bind(write.value)
    .bind(write.status)
    .bind(write.product_scope_mode)
    .bind(write.starts_at)
    .bind(write.ends_at)
    .bind(write.usage_limit)
    .bind(write.per_customer_limit)
    .bind(write.minimum_order_cents)
    .bind(write.maximum_discount_cents)
    .bind(write.shipping_discount_percent)
    .bind(write.stackable)
    .bind(write.first_purchase_only)
    .execute(&mut **tx)
    .await?;

    sqlx::query(r#"DELETE FROM "CouponProduct" WHERE "tenantId" = $1 AND "couponId" = $2"#)
        .bind(tenant.as_str())
        .bind(coupon_id)
        .execute(&mut **tx)
        .await?;

    link_products(&mut tx, tenant, coupon_id, write.product_ids).await?;

    tx.commit().await?;

    Ok(true)
}

/// Deletes or archives one coupon. `None` means the id is not a live coupon of
/// the store, so a repeated delete is `NOT_FOUND` rather than a second archive.
pub async fn coupon_delete(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
    now: NaiveDateTime,
) -> Result<Option<CouponDeleteOutcome>, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let Some(outcome) = delete_one(&mut tx, tenant, coupon_id, now).await? else {
        return Ok(None);
    };

    tx.commit().await?;

    Ok(Some(outcome))
}

/// Deletes or archives the whole selection in one transaction.
///
/// `None` means one id is unknown, another tenant's or already archived; the
/// batch then rolls back rather than reporting a partial delete over a
/// selection the caller cannot see.
pub async fn coupon_bulk_delete(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_ids: &[String],
    now: NaiveDateTime,
) -> Result<Option<(i64, i64)>, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;
    let mut deleted = 0;
    let mut archived = 0;

    for coupon_id in coupon_ids {
        let Some(outcome) = delete_one(&mut tx, tenant, coupon_id, now).await? else {
            return Ok(None);
        };

        match outcome {
            CouponDeleteOutcome::Deleted => deleted += 1,
            CouponDeleteOutcome::Archived => archived += 1,
        }
    }

    tx.commit().await?;

    Ok(Some((deleted, archived)))
}

/// Writes the switch value. `false` means the coupon is not a live one.
pub async fn coupon_set_status(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
    status: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        r#"UPDATE "Coupon" SET status = $3
            WHERE "tenantId" = $1 AND id = $2 AND "deletedAt" IS NULL"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .bind(status)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// One grouped row per `(couponId, customerId)`.
pub async fn coupon_redemption_pairs(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_ids: &[String],
) -> Result<Vec<RedemptionPair>, sqlx::Error> {
    if coupon_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query_as::<_, (String, i64, i64, NaiveDateTime, NaiveDateTime)>(
        r#"SELECT "couponId", count(*), coalesce(sum("discountCents"), 0),
                  max("createdAt"), min("createdAt")
             FROM "CouponRedemption"
            WHERE "tenantId" = $1 AND "couponId" = ANY($2)
            GROUP BY "couponId", "customerId""#,
    )
    .bind(tenant.as_str())
    .bind(coupon_ids.to_vec())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| RedemptionPair {
            coupon_id: row.0,
            redemptions: row.1,
            discount_cents: row.2,
            last_redeemed_at: row.3,
            first_redeemed_at: row.4,
        })
        .collect())
}

/// A page of the coupon's redemption history.
///
/// The search box narrows the rows in the database instead of shipping all of
/// them to the browser. An empty `search` means no restriction; the caller
/// passes the escaped `ILIKE` pattern.
pub async fn coupon_redemptions(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
    search: &str,
    sort: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<CouponRedemptionRow>, sqlx::Error> {
    let sql = format!(
        r#"SELECT r.id, r."discountCents", r."createdAt",
                  c.id, c.name, c.email,
                  o.id, o.code, o."totalCents", o."createdAt"
             FROM "CouponRedemption" r
             JOIN "Customer" c
               ON c.id = r."customerId" AND c."tenantId" = r."tenantId"
             JOIN "Order" o
               ON o.id = r."orderId" AND o."tenantId" = r."tenantId"
            WHERE r."tenantId" = $1 AND r."couponId" = $2
              AND ($3 = ''
                OR c.name ILIKE $3
                OR c.email ILIKE $3
                OR o.code ILIKE $3)
            ORDER BY {}
            LIMIT $4 OFFSET $5"#,
        redemption_order(sort)
    );

    let rows = sqlx::query_as::<
        _,
        (
            String,
            i32,
            NaiveDateTime,
            String,
            String,
            String,
            String,
            String,
            i32,
            NaiveDateTime,
        ),
    >(sqlx::AssertSqlSafe(sql))
    .bind(tenant.as_str())
    .bind(coupon_id)
    .bind(search)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| CouponRedemptionRow {
            id: row.0,
            discount_cents: row.1,
            created_at: row.2,
            customer_id: row.3,
            customer_name: row.4,
            customer_email: row.5,
            order_id: row.6,
            order_code: row.7,
            order_total_cents: row.8,
            order_created_at: row.9,
        })
        .collect())
}

/// How many rows the search matches, so the client knows how many pages exist.
pub async fn coupon_redemptions_total(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
    search: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query_as::<_, (i64,)>(
        r#"SELECT count(*)
             FROM "CouponRedemption" r
             JOIN "Customer" c
               ON c.id = r."customerId" AND c."tenantId" = r."tenantId"
             JOIN "Order" o
               ON o.id = r."orderId" AND o."tenantId" = r."tenantId"
            WHERE r."tenantId" = $1 AND r."couponId" = $2
              AND ($3 = ''
                OR c.name ILIKE $3
                OR c.email ILIKE $3
                OR o.code ILIKE $3)"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .bind(search)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

/// The chart is per day across the coupon's whole life, so the timestamps are
/// grouped in SQL and folded by day in the domain.
pub async fn coupon_usage(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
) -> Result<Vec<UsageRow>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, i64, i64)>(
        r#"SELECT to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS'),
                  count(*), coalesce(sum("discountCents"), 0)
             FROM "CouponRedemption"
            WHERE "tenantId" = $1 AND "couponId" = $2
            GROUP BY "createdAt"
            ORDER BY "createdAt" ASC"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| UsageRow {
            created_at: row.0,
            redemptions: row.1,
            discount_cents: row.2,
        })
        .collect())
}

/// Sum of the orders that used the coupon; the redemption row does not carry
/// their totals.
pub async fn coupon_orders_total(
    pool: &PgPool,
    tenant: &TenantId,
    coupon_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query_as::<_, (i64,)>(
        r#"SELECT coalesce(sum(o."totalCents"), 0)
             FROM "CouponRedemption" r
             JOIN "Order" o
               ON o.id = r."orderId" AND o."tenantId" = r."tenantId"
            WHERE r."tenantId" = $1 AND r."couponId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

/// The ledger decides the outcome, so the check and the write share one
/// transaction.
async fn delete_one(
    conn: &mut PgConnection,
    tenant: &TenantId,
    coupon_id: &str,
    now: NaiveDateTime,
) -> Result<Option<CouponDeleteOutcome>, sqlx::Error> {
    let live = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Coupon"
            WHERE "tenantId" = $1 AND id = $2 AND "deletedAt" IS NULL"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .fetch_optional(&mut *conn)
    .await?;

    if live.is_none() {
        return Ok(None);
    }

    let outcome = coupon_delete_outcome(coupon_is_linked(conn, tenant, coupon_id).await?);

    match outcome {
        CouponDeleteOutcome::Archived => {
            sqlx::query(
                r#"UPDATE "Coupon" SET "deletedAt" = $3, status = 'disabled'
                    WHERE "tenantId" = $1 AND id = $2"#,
            )
            .bind(tenant.as_str())
            .bind(coupon_id)
            .bind(now)
            .execute(&mut *conn)
            .await?;
        }
        CouponDeleteOutcome::Deleted => {
            sqlx::query(r#"DELETE FROM "Coupon" WHERE "tenantId" = $1 AND id = $2"#)
                .bind(tenant.as_str())
                .bind(coupon_id)
                .execute(&mut *conn)
                .await?;
        }
    }

    Ok(Some(outcome))
}

/// An order or a redemption that names the coupon keeps it on the books.
async fn coupon_is_linked(
    conn: &mut PgConnection,
    tenant: &TenantId,
    coupon_id: &str,
) -> Result<bool, sqlx::Error> {
    let redemption = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "CouponRedemption" WHERE "tenantId" = $1 AND "couponId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .fetch_optional(&mut *conn)
    .await?;

    if redemption.is_some() {
        return Ok(true);
    }

    let order = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Order" WHERE "tenantId" = $1 AND "couponId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(coupon_id)
    .fetch_optional(&mut *conn)
    .await?;

    Ok(order.is_some())
}

/// Every id must name a product of this store.
async fn products_owned(
    conn: &mut PgConnection,
    tenant: &TenantId,
    product_ids: &[String],
) -> Result<bool, sqlx::Error> {
    if product_ids.is_empty() {
        return Ok(true);
    }

    let row = sqlx::query_as::<_, (i64,)>(
        r#"SELECT count(*) FROM "Product" WHERE "tenantId" = $1 AND id = ANY($2)"#,
    )
    .bind(tenant.as_str())
    .bind(product_ids.to_vec())
    .fetch_one(&mut *conn)
    .await?;

    Ok(row.0 == product_ids.len() as i64)
}

/// Inserts one link per distinct product.
async fn link_products(
    conn: &mut PgConnection,
    tenant: &TenantId,
    coupon_id: &str,
    product_ids: &[String],
) -> Result<(), sqlx::Error> {
    for product_id in product_ids {
        sqlx::query(
            r#"INSERT INTO "CouponProduct" ("tenantId", "couponId", "productId")
               VALUES ($1, $2, $3)
               ON CONFLICT ("couponId", "productId") DO NOTHING"#,
        )
        .bind(tenant.as_str())
        .bind(coupon_id)
        .bind(product_id)
        .execute(&mut *conn)
        .await?;
    }

    Ok(())
}

/// The `ORDER BY` body: every arm is a literal, never caller text.
fn redemption_order(sort: &str) -> &'static str {
    match sort {
        "oldest" => r#"r."createdAt" ASC, r.id ASC"#,
        "discount" => r#"r."discountCents" DESC, r."createdAt" DESC, r.id DESC"#,
        _ => r#"r."createdAt" DESC, r.id DESC"#,
    }
}
