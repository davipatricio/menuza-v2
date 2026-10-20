#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/c37a2f3113252b2174a11c63e51dfcd2a89f861759d025c8777eb2fadd2b8a66/contract";
import endContract from "../../snapshots/c37a2f3113252b2174a11c63e51dfcd2a89f861759d025c8777eb2fadd2b8a66/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/c8f47e416ec3283638ee6fd97f99117ab6c129c45931f90b5f085e3d3c5849d6/contract";
import startContract from "../../snapshots/c8f47e416ec3283638ee6fd97f99117ab6c129c45931f90b5f085e3d3c5849d6/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
} from "@prisma/orm-postgres/migration";

/**
 * The old single-axis `status` maps onto the two new axes. Rows are matched by
 * the legacy slug, so the backfill stays valid whatever the ordering of the
 * columns the planner added.
 */
const FINANCIAL_FROM_STATUS = `CASE "status"
  WHEN 'paid' THEN 'paid'
  WHEN 'delivered' THEN 'paid'
  WHEN 'completed' THEN 'paid'
  WHEN 'ready' THEN 'paid'
  WHEN 'awaiting_payment' THEN 'awaiting_payment'
  WHEN 'refunded' THEN 'refunded'
  WHEN 'expired' THEN 'expired'
  WHEN 'canceled' THEN 'canceled'
  ELSE 'pending'
END`;

const FULFILMENT_FROM_STATUS = `CASE "status"
  WHEN 'confirmed' THEN 'confirmed'
  WHEN 'ready' THEN 'ready'
  WHEN 'ready_for_pickup' THEN 'ready_for_pickup'
  WHEN 'delivered' THEN 'completed'
  WHEN 'completed' THEN 'completed'
  WHEN 'paid' THEN 'confirmed'
  WHEN 'refunded' THEN 'canceled'
  WHEN 'expired' THEN 'canceled'
  WHEN 'canceled' THEN 'canceled'
  ELSE 'pending'
END`;

/** A backfill: precheck finds unfinished rows, execute writes them, postcheck proves it. */
function backfill(id: string, column: string, assignment: string) {
  return rawSql({
    id: `data_migration.${id}`,
    label: `Backfill "Order"."${column}"`,
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: `Check "${column}" has rows left to backfill`,
        sql: `SELECT EXISTS (SELECT 1 FROM "public"."Order" WHERE "${column}" IS NULL) AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: `Backfill "${column}"`,
        sql: `UPDATE "public"."Order" SET "${column}" = ${assignment} WHERE "${column}" IS NULL`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: `Verify "${column}" is fully backfilled`,
        sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."Order" WHERE "${column}" IS NULL) AS ok`,
        params: [],
      },
    ],
  });
}

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "Order_status_check_b7a5d829",
      }),
      this.createTable({
        schema: "public",
        table: "CouponRedemption",
        columns: [
          col("couponId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("customerId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("discountCents", "int4", { notNull: true, codecRef: { codecId: "pg/int4@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("orderId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [primaryKey(["id"], { name: "CouponRedemption_pkey" })],
      }),
      this.createTable({
        schema: "public",
        table: "OrderEvent",
        columns: [
          col("actorMemberId", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("detail", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("fromValue", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("orderId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("reason", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("toValue", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("type", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [
          primaryKey(["id"], { name: "OrderEvent_pkey" }),
          checkExpression(
            "OrderEvent_type_check_d52305fd",
            `"type" IN ('financial_changed', 'fulfilment_changed', 'payment_recorded', 'refunded', 'cashback_credited', 'cashback_reversed', 'wallet_reserved', 'wallet_released', 'note')`,
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "OrderItem",
        columns: [
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("kitId", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("lineTotalCents", "int4", { notNull: true, codecRef: { codecId: "pg/int4@1" } }),
          col("name", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("optionsLabel", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("orderId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("productId", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("quantity", "int4", { notNull: true, codecRef: { codecId: "pg/int4@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("unitPriceCents", "int4", { notNull: true, codecRef: { codecId: "pg/int4@1" } }),
          col("variationId", "text", { codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [
          primaryKey(["id"], { name: "OrderItem_pkey" }),
          checkExpression("order_item_line_total_non_negative_86cf5b60", '"lineTotalCents" >= 0'),
          checkExpression("order_item_quantity_positive_fc510296", '"quantity" > 0'),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "SeoMeta",
        columns: [
          col("canonicalUrl", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("description", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("entityId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("entityType", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("jsonLd", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("socialImageUrl", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("title", "text", { codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [
          primaryKey(["id"], { name: "SeoMeta_pkey" }),
          checkExpression(
            "SeoMeta_entityType_check_c2bacec7",
            `"entityType" IN ('store', 'department', 'category', 'tag', 'product', 'kit', 'coupon')`,
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "StoreSettings",
        columns: [
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("seoDescriptionTemplate", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("seoSocialImageUrl", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("seoTitleTemplate", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("updatedAt", "timestamp(3)", {
            notNull: true,
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(["id"], { name: "StoreSettings_pkey" })],
      }),
      this.createTable({
        schema: "public",
        table: "Wallet",
        columns: [
          col("balanceCents", "int4", {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("customerId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("updatedAt", "timestamp(3)", {
            notNull: true,
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(["id"], { name: "Wallet_pkey" }),
          checkExpression("wallet_balance_non_negative_0339119a", '"balanceCents" >= 0'),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "WalletTransaction",
        columns: [
          col("actorMemberId", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("amountCents", "int4", { notNull: true, codecRef: { codecId: "pg/int4@1" } }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("kind", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("orderId", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("reason", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("walletId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [
          primaryKey(["id"], { name: "WalletTransaction_pkey" }),
          checkExpression(
            "WalletTransaction_kind_check_b5bcca69",
            `"kind" IN ('cashback_credit', 'store_credit', 'reserve', 'reserve_release', 'spend', 'reversal', 'adjustment')`,
          ),
        ],
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("cashbackCents", "int4", {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: "pg/int4@1" },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("couponId", "text", { codecRef: { codecId: "pg/text@1" } }),
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("discountCents", "int4", {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: "pg/int4@1" },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("expiresAt", "timestamp(3)", {
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("paidAt", "timestamp(3)", {
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("paymentMethod", "text", { codecRef: { codecId: "pg/text@1" } }),
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("shippingCents", "int4", {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: "pg/int4@1" },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("walletAppliedCents", "int4", {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: "pg/int4@1" },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("financialStatus", "text", { codecRef: { codecId: "pg/text@1" } }),
      }),
      backfill("backfill-Order-financialStatus", "financialStatus", FINANCIAL_FROM_STATUS),
      this.setNotNull({ schema: "public", table: "Order", column: "financialStatus" }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("fulfilmentStatus", "text", { codecRef: { codecId: "pg/text@1" } }),
      }),
      backfill("backfill-Order-fulfilmentStatus", "fulfilmentStatus", FULFILMENT_FROM_STATUS),
      this.setNotNull({ schema: "public", table: "Order", column: "fulfilmentStatus" }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("subtotalCents", "int4", { codecRef: { codecId: "pg/int4@1" } }),
      }),
      backfill("backfill-Order-subtotalCents", "subtotalCents", `"totalCents"`),
      this.setNotNull({ schema: "public", table: "Order", column: "subtotalCents" }),
      this.addColumn({
        schema: "public",
        table: "Order",
        column: col("updatedAt", "timestamp(3)", {
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      backfill("backfill-Order-updatedAt", "updatedAt", `"createdAt"`),
      this.setNotNull({ schema: "public", table: "Order", column: "updatedAt" }),
      this.dropColumn({ schema: "public", table: "Order", column: "status" }),
      this.addUnique({
        schema: "public",
        table: "CouponRedemption",
        constraint: "CouponRedemption_couponId_customerId_key",
        columns: ["couponId", "customerId"],
      }),
      this.addUnique({
        schema: "public",
        table: "CouponRedemption",
        constraint: "CouponRedemption_couponId_orderId_key",
        columns: ["couponId", "orderId"],
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "Order_financialStatus_check_0d3e40f8",
        expression: `"financialStatus" IN ('pending', 'awaiting_payment', 'pending_on_delivery', 'paid', 'refunded', 'expired', 'canceled')`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "Order_fulfilmentStatus_check_8d6331ae",
        expression: `"fulfilmentStatus" IN ('pending', 'confirmed', 'preparing', 'ready', 'ready_for_pickup', 'out_for_delivery', 'completed', 'canceled')`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "Order_paymentMethod_check_8e20e6eb",
        expression: `"paymentMethod" IN ('pix', 'credit', 'debit', 'meal_voucher', 'food_voucher', 'cash_on_delivery', 'card_on_delivery')`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "order_cashback_non_negative_4bb14f5b",
        expression: '"cashbackCents" >= 0',
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "order_discount_non_negative_c4cb812b",
        expression: '"discountCents" >= 0',
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "order_shipping_non_negative_7933259a",
        expression: '"shippingCents" >= 0',
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "order_subtotal_non_negative_ad011395",
        expression: '"subtotalCents" >= 0',
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "order_total_matches_lines_fb0005a4",
        expression: '"totalCents" = "subtotalCents" - "discountCents" + "shippingCents"',
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "order_wallet_applied_non_negative_c45f4ae9",
        expression: '"walletAppliedCents" >= 0',
      }),
      this.addUnique({
        schema: "public",
        table: "SeoMeta",
        constraint: "SeoMeta_tenantId_entityType_entityId_key",
        columns: ["tenantId", "entityType", "entityId"],
      }),
      this.addUnique({
        schema: "public",
        table: "StoreSettings",
        constraint: "StoreSettings_tenantId_key",
        columns: ["tenantId"],
      }),
      this.addUnique({
        schema: "public",
        table: "Wallet",
        constraint: "Wallet_tenantId_customerId_key",
        columns: ["tenantId", "customerId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CouponRedemption",
        index: "CouponRedemption_couponId_idx_a9dd19dc",
        columns: ["couponId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CouponRedemption",
        index: "CouponRedemption_customerId_idx_b2a8a46c",
        columns: ["customerId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CouponRedemption",
        index: "CouponRedemption_orderId_idx_d284871b",
        columns: ["orderId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CouponRedemption",
        index: "CouponRedemption_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "Order",
        index: "Order_couponId_idx_a9dd19dc",
        columns: ["couponId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OrderEvent",
        index: "OrderEvent_orderId_idx",
        columns: ["orderId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OrderEvent",
        index: "OrderEvent_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OrderItem",
        index: "OrderItem_kitId_idx_60437f65",
        columns: ["kitId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OrderItem",
        index: "OrderItem_orderId_idx",
        columns: ["orderId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OrderItem",
        index: "OrderItem_productId_idx_5858600a",
        columns: ["productId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OrderItem",
        index: "OrderItem_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OrderItem",
        index: "OrderItem_variationId_idx_a2646852",
        columns: ["variationId"],
      }),
      this.createIndex({
        schema: "public",
        table: "SeoMeta",
        index: "SeoMeta_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "Wallet",
        index: "Wallet_customerId_idx_b2a8a46c",
        columns: ["customerId"],
      }),
      this.createIndex({
        schema: "public",
        table: "Wallet",
        index: "Wallet_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "WalletTransaction",
        index: "WalletTransaction_orderId_idx_d284871b",
        columns: ["orderId"],
      }),
      this.createIndex({
        schema: "public",
        table: "WalletTransaction",
        index: "WalletTransaction_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "WalletTransaction",
        index: "WalletTransaction_walletId_idx",
        columns: ["walletId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "CouponRedemption",
        foreignKey: {
          name: "CouponRedemption_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "CouponRedemption",
        foreignKey: {
          name: "CouponRedemption_couponId_fkey",
          columns: ["couponId"],
          references: { schema: "public", table: "Coupon", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "CouponRedemption",
        foreignKey: {
          name: "CouponRedemption_orderId_fkey",
          columns: ["orderId"],
          references: { schema: "public", table: "Order", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "CouponRedemption",
        foreignKey: {
          name: "CouponRedemption_customerId_fkey",
          columns: ["customerId"],
          references: { schema: "public", table: "Customer", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "Order",
        foreignKey: {
          name: "Order_couponId_fkey",
          columns: ["couponId"],
          references: { schema: "public", table: "Coupon", columns: ["id"] },
          onDelete: "setNull",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OrderEvent",
        foreignKey: {
          name: "OrderEvent_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OrderEvent",
        foreignKey: {
          name: "OrderEvent_orderId_fkey",
          columns: ["orderId"],
          references: { schema: "public", table: "Order", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OrderItem",
        foreignKey: {
          name: "OrderItem_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OrderItem",
        foreignKey: {
          name: "OrderItem_orderId_fkey",
          columns: ["orderId"],
          references: { schema: "public", table: "Order", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OrderItem",
        foreignKey: {
          name: "OrderItem_productId_fkey",
          columns: ["productId"],
          references: { schema: "public", table: "Product", columns: ["id"] },
          onDelete: "setNull",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OrderItem",
        foreignKey: {
          name: "OrderItem_variationId_fkey",
          columns: ["variationId"],
          references: { schema: "public", table: "Variation", columns: ["id"] },
          onDelete: "setNull",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OrderItem",
        foreignKey: {
          name: "OrderItem_kitId_fkey",
          columns: ["kitId"],
          references: { schema: "public", table: "Kit", columns: ["id"] },
          onDelete: "setNull",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "SeoMeta",
        foreignKey: {
          name: "SeoMeta_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "StoreSettings",
        foreignKey: {
          name: "StoreSettings_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "Wallet",
        foreignKey: {
          name: "Wallet_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "Wallet",
        foreignKey: {
          name: "Wallet_customerId_fkey",
          columns: ["customerId"],
          references: { schema: "public", table: "Customer", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "WalletTransaction",
        foreignKey: {
          name: "WalletTransaction_walletId_fkey",
          columns: ["walletId"],
          references: { schema: "public", table: "Wallet", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "WalletTransaction",
        foreignKey: {
          name: "WalletTransaction_orderId_fkey",
          columns: ["orderId"],
          references: { schema: "public", table: "Order", columns: ["id"] },
          onDelete: "setNull",
          onUpdate: "cascade",
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
