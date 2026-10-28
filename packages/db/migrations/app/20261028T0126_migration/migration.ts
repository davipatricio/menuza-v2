#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/3ffcaaf20c0eb7a87d43415b953d9c4db06db042c13d4c947c0e37f4e44f731b/contract";
import startContract from "../../snapshots/3ffcaaf20c0eb7a87d43415b953d9c4db06db042c13d4c947c0e37f4e44f731b/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/de34b32af6735ffc1928de24511f3550e14b02af6c3a7b2ad46b906b48a5fded/contract";
import endContract from "../../snapshots/de34b32af6735ffc1928de24511f3550e14b02af6c3a7b2ad46b906b48a5fded/contract.json" with { type: "json" };
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
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
