/**
 * Shared helpers for the `panel.integrations` procedures.
 *
 * The catalog lives in `@menuza/shared/tenant` (`integrations.ts`) and the
 * per-store state in `StoreIntegration`. A store that has never touched an
 * integration has no row, so every read here is "row or catalog default" —
 * absence means disabled with the catalog's own defaults, never an error.
 */
import { ORPCError } from "@orpc/server";
import * as v from "valibot";
import { db, withTenant } from "@menuza/db";
import { sharedErrorCodes } from "@menuza/shared/errors";
import {
  defaultConfigFor,
  findIntegration,
  type IntegrationConfig,
  type PanelIntegration,
  type PanelMcpSession,
} from "@menuza/shared/tenant";
import { isoOf } from "./taxonomy.ts";

/**
 * The columns these procedures read off a `StoreIntegration` row.
 *
 * Declared structurally rather than as the ORM's row type: the contract row has
 * more columns, and naming only these is what lets a caller pass one straight
 * through without restating or asserting its shape.
 */
export interface StoreIntegrationRow {
  readonly status: string;
  readonly config: string | null;
  readonly enabledAt: Temporal.PlainDateTime | null;
  readonly updatedAt: Temporal.PlainDateTime;
}

/** One stored setting value; anything else in the blob is dropped. */
const StoredConfigSchema = v.record(v.string(), v.union([v.string(), v.boolean()]));

/**
 * The config blob as stored. A row written by an older catalog can carry a key
 * the current definition dropped, and a malformed blob must not 500 the page:
 * unknown keys are ignored and missing ones take the catalog default.
 */
export function parseConfig(integrationId: string, raw: string | null): IntegrationConfig {
  const definition = findIntegration(integrationId);
  const defaults = definition ? defaultConfigFor(definition) : {};

  if (!raw) return defaults;

  let json: unknown;

  try {
    json = JSON.parse(raw);
  } catch {
    return defaults;
  }

  // Validated rather than inspected: the blob is data the database handed back,
  // so the boundary parse is what makes each value a string or a boolean.
  const parsed = v.safeParse(StoredConfigSchema, json);

  if (!parsed.success) return defaults;

  return { ...defaults, ...parsed.output };
}

export function serializeConfig(config: IntegrationConfig): string {
  return JSON.stringify(config);
}

/** One catalog integration's state for a store, with defaults filled in. */
export function toPanelIntegration(
  integrationId: string,
  row: StoreIntegrationRow | null,
): PanelIntegration {
  return {
    integrationId,
    status: row ? asStatus(row.status) : "disabled",
    config: parseConfig(integrationId, row?.config ?? null),
    enabledAt: row?.enabledAt ? isoOf(row.enabledAt) : null,
    updatedAt: row ? isoOf(row.updatedAt) : null,
  };
}

/**
 * A stored status outside the closed set is treated as `disabled`: an unknown
 * value must not be read as "on".
 */
function asStatus(value: string): PanelIntegration["status"] {
  return value === "enabled" || value === "paused" || value === "error" ? value : "disabled";
}

/** Throws NOT_FOUND for an integration id the catalog does not define. */
export function requireIntegration(integrationId: string) {
  const definition = findIntegration(integrationId);

  if (!definition) {
    throw new ORPCError("NOT_FOUND", {
      message: sharedErrorCodes.NOT_FOUND.message,
      data: { code: "NOT_FOUND" },
    });
  }

  return definition;
}

export function inStoreScope<T>(tenantId: string, fn: () => T | Promise<T>): Promise<T> {
  return withTenant(tenantId, fn);
}

/**
 * The store's MCP sessions, joined to the member that created each one.
 *
 * Returns only live sessions (not revoked, token not expired): the list is
 * "what is connected right now", and a revoked row is history the audit log
 * already owns.
 */
export async function loadMcpSessions(tenantId: string): Promise<PanelMcpSession[]> {
  const rows = await inStoreScope(tenantId, () =>
    db.orm.public.McpSession.where({ tenantId, integrationId: "mcp-dashboard" }).all(),
  );

  const live = rows.filter((row) => row.revokedAt === null);

  const members = await inStoreScope(tenantId, () =>
    Promise.all(live.map((row) => db.orm.public.Member.where({ id: row.memberId }).first())),
  );

  return live.flatMap((row, index) => {
    const member = members[index];

    if (!member) return [];

    return [
      {
        id: row.id,
        label: row.label,
        clientName: row.clientName,
        memberName: member.name ?? member.email,
        createdAt: isoOf(row.createdAt),
        lastUsedAt: row.lastUsedAt ? isoOf(row.lastUsedAt) : null,
      },
    ];
  });
}
