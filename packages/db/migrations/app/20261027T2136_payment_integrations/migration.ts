#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/212ede6a2bcc3594234caed0244334a6b6bb3990349742655ddedf63e9ce64e0/contract";
import startContract from "../../snapshots/212ede6a2bcc3594234caed0244334a6b6bb3990349742655ddedf63e9ce64e0/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/3ffcaaf20c0eb7a87d43415b953d9c4db06db042c13d4c947c0e37f4e44f731b/contract";
import endContract from "../../snapshots/3ffcaaf20c0eb7a87d43415b953d9c4db06db042c13d4c947c0e37f4e44f731b/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "Order_paymentMethod_check_8e20e6eb",
      }),
      this.createTable({
        schema: "public",
        table: "GatewayEvent",
        columns: [
          col("amountCents", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("detail", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("externalId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("integrationId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("orderCode", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("processedAt", "timestamp(3)", {
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("provider", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("receivedAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("status", "text", {
            notNull: true,
            default: lit("received"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("type", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [
          primaryKey(["id"], { name: "GatewayEvent_pkey" }),
          checkExpression(
            "GatewayEvent_provider_check_59ce43d4",
            sql`"provider" IN ('pagarme', 'offline')`,
          ),
          checkExpression(
            "GatewayEvent_status_check_11ff3856",
            sql`"status" IN ('received', 'processed', 'ignored', 'rejected', 'failed')`,
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "PaymentIntegration",
        columns: [
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("credentials", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("label", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("provider", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("status", "text", {
            notNull: true,
            default: lit("active"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("updatedAt", "timestamp(3)", {
            notNull: true,
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("webhookToken", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [
          primaryKey(["id"], { name: "PaymentIntegration_pkey" }),
          checkExpression(
            "PaymentIntegration_provider_check_59ce43d4",
            sql`"provider" IN ('pagarme', 'offline')`,
          ),
          checkExpression(
            "PaymentIntegration_status_check_39370351",
            sql`"status" IN ('active', 'disabled')`,
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "PaymentMethodAssignment",
        columns: [
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("integrationId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("method", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("updatedAt", "timestamp(3)", {
            notNull: true,
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(["id"], { name: "PaymentMethodAssignment_pkey" }),
          checkExpression(
            "PaymentMethodAssignment_method_check_e4b3b3b0",
            sql`"method" IN ('pix', 'credit', 'debit', 'meal_voucher', 'food_voucher', 'boleto', 'cash_on_delivery', 'card_on_delivery')`,
          ),
        ],
      }),
      this.addUnique({
        schema: "public",
        table: "GatewayEvent",
        constraint: "GatewayEvent_tenantId_provider_externalId_key",
        columns: ["tenantId", "provider", "externalId"],
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "Order_paymentMethod_check_f6d9452e",
        expression: sql`"paymentMethod" IN ('pix', 'credit', 'debit', 'meal_voucher', 'food_voucher', 'boleto', 'cash_on_delivery', 'card_on_delivery')`,
      }),
      this.addUnique({
        schema: "public",
        table: "PaymentIntegration",
        constraint: "PaymentIntegration_webhookToken_key",
        columns: ["webhookToken"],
      }),
      this.addUnique({
        schema: "public",
        table: "PaymentMethodAssignment",
        constraint: "PaymentMethodAssignment_tenantId_method_key",
        columns: ["tenantId", "method"],
      }),
      this.createIndex({
        schema: "public",
        table: "GatewayEvent",
        index: "GatewayEvent_integrationId_idx",
        columns: ["integrationId"],
      }),
      this.createIndex({
        schema: "public",
        table: "GatewayEvent",
        index: "GatewayEvent_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "PaymentIntegration",
        index: "PaymentIntegration_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "PaymentMethodAssignment",
        index: "PaymentMethodAssignment_integrationId_idx",
        columns: ["integrationId"],
      }),
      this.createIndex({
        schema: "public",
        table: "PaymentMethodAssignment",
        index: "PaymentMethodAssignment_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "GatewayEvent",
        foreignKey: {
          name: "GatewayEvent_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "GatewayEvent",
        foreignKey: {
          name: "GatewayEvent_integrationId_fkey",
          columns: ["integrationId"],
          references: { schema: "public", table: "PaymentIntegration", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "PaymentIntegration",
        foreignKey: {
          name: "PaymentIntegration_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "PaymentMethodAssignment",
        foreignKey: {
          name: "PaymentMethodAssignment_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "PaymentMethodAssignment",
        foreignKey: {
          name: "PaymentMethodAssignment_integrationId_fkey",
          columns: ["integrationId"],
          references: { schema: "public", table: "PaymentIntegration", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
