#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/5d2fdbe64aba68f866284af3267cd29a8e673c5693ae8dedf703eae723148303/contract";
import endContract from "../../snapshots/5d2fdbe64aba68f866284af3267cd29a8e673c5693ae8dedf703eae723148303/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/dab0dc9fa8fd2f3066aacb18bab8fdc86501182c1714cb38c2389242d7c8b115/contract";
import startContract from "../../snapshots/dab0dc9fa8fd2f3066aacb18bab8fdc86501182c1714cb38c2389242d7c8b115/contract.json" with { type: "json" };
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
      this.createTable({
        schema: "public",
        table: "McpSession",
        columns: [
          col("clientName", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("integrationId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("label", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("lastUsedAt", "timestamp(3)", {
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("memberId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("oauthTokenId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("revokedAt", "timestamp(3)", {
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("tokenDigest", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [primaryKey(["id"], { name: "McpSession_pkey" })],
      }),
      this.createTable({
        schema: "public",
        table: "OAuthAuthCode",
        columns: [
          col("clientId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("codeChallenge", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("codeChallengeMethod", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("codeHash", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("expiresAt", "timestamp(3)", {
            notNull: true,
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("memberId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("redirectUri", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("scopes", "text[]", {
            notNull: true,
            codecRef: { codecId: "pg/text@1", many: true },
          }),
          col("tenantIds", "text[]", {
            notNull: true,
            codecRef: { codecId: "pg/text@1", many: true },
          }),
        ],
        constraints: [
          primaryKey(["id"], { name: "OAuthAuthCode_pkey" }),
          checkExpression(
            "OAuthAuthCode_scopes_elem_not_null_de6fcc8e",
            sql`array_position("scopes", NULL) IS NULL`,
          ),
          checkExpression(
            "OAuthAuthCode_tenantIds_elem_not_null_48f162d4",
            sql`array_position("tenantIds", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "OAuthClient",
        columns: [
          col("clientId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("clientSecretHash", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("isPublic", "bool", {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("name", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("redirectUris", "text[]", {
            notNull: true,
            codecRef: { codecId: "pg/text@1", many: true },
          }),
        ],
        constraints: [
          primaryKey(["id"], { name: "OAuthClient_pkey" }),
          checkExpression(
            "OAuthClient_redirectUris_elem_not_null_57e7d982",
            sql`array_position("redirectUris", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "OAuthToken",
        columns: [
          col("accessTokenHash", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("clientId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("expiresAt", "timestamp(3)", {
            notNull: true,
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("memberId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("refreshTokenHash", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("revokedAt", "timestamp(3)", {
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("scopes", "text[]", {
            notNull: true,
            codecRef: { codecId: "pg/text@1", many: true },
          }),
          col("tenantIds", "text[]", {
            notNull: true,
            codecRef: { codecId: "pg/text@1", many: true },
          }),
        ],
        constraints: [
          primaryKey(["id"], { name: "OAuthToken_pkey" }),
          checkExpression(
            "OAuthToken_scopes_elem_not_null_de6fcc8e",
            sql`array_position("scopes", NULL) IS NULL`,
          ),
          checkExpression(
            "OAuthToken_tenantIds_elem_not_null_48f162d4",
            sql`array_position("tenantIds", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "StoreIntegration",
        columns: [
          col("config", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("enabledAt", "timestamp(3)", {
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("integrationId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("status", "text", {
            notNull: true,
            default: lit("disabled"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("updatedAt", "timestamp(3)", {
            notNull: true,
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(["id"], { name: "StoreIntegration_pkey" }),
          checkExpression(
            "StoreIntegration_status_check_7d6cabce",
            sql`"status" IN ('enabled', 'disabled', 'paused', 'error')`,
          ),
        ],
      }),
      this.addUnique({
        schema: "public",
        table: "StoreIntegration",
        constraint: "StoreIntegration_tenantId_integrationId_key",
        columns: ["tenantId", "integrationId"],
      }),
      this.createIndex({
        schema: "public",
        table: "McpSession",
        index: "McpSession_memberId_idx",
        columns: ["memberId"],
      }),
      this.createIndex({
        schema: "public",
        table: "McpSession",
        index: "McpSession_tenantId_idx_c93ed4f1",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "McpSession",
        index: "McpSession_tenantId_integrationId_idx",
        columns: ["tenantId", "integrationId"],
      }),
      this.createIndex({
        schema: "public",
        table: "McpSession",
        index: "McpSession_tokenDigest_key",
        columns: ["tokenDigest"],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: "public",
        table: "OAuthAuthCode",
        index: "OAuthAuthCode_clientId_idx_153a9a49",
        columns: ["clientId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OAuthAuthCode",
        index: "OAuthAuthCode_codeHash_key",
        columns: ["codeHash"],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: "public",
        table: "OAuthAuthCode",
        index: "OAuthAuthCode_expiresAt_idx",
        columns: ["expiresAt"],
      }),
      this.createIndex({
        schema: "public",
        table: "OAuthClient",
        index: "OAuthClient_clientId_key",
        columns: ["clientId"],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: "public",
        table: "OAuthToken",
        index: "OAuthToken_accessTokenHash_key",
        columns: ["accessTokenHash"],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: "public",
        table: "OAuthToken",
        index: "OAuthToken_clientId_idx_153a9a49",
        columns: ["clientId"],
      }),
      this.createIndex({
        schema: "public",
        table: "OAuthToken",
        index: "OAuthToken_expiresAt_idx",
        columns: ["expiresAt"],
      }),
      this.createIndex({
        schema: "public",
        table: "OAuthToken",
        index: "OAuthToken_refreshTokenHash_key",
        columns: ["refreshTokenHash"],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: "public",
        table: "StoreIntegration",
        index: "StoreIntegration_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "McpSession",
        foreignKey: {
          name: "McpSession_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OAuthAuthCode",
        foreignKey: {
          name: "OAuthAuthCode_clientId_fkey",
          columns: ["clientId"],
          references: { schema: "public", table: "OAuthClient", columns: ["clientId"] },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "OAuthToken",
        foreignKey: {
          name: "OAuthToken_clientId_fkey",
          columns: ["clientId"],
          references: { schema: "public", table: "OAuthClient", columns: ["clientId"] },
          onDelete: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "StoreIntegration",
        foreignKey: {
          name: "StoreIntegration_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
