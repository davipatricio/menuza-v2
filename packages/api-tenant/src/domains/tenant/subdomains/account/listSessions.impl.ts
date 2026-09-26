import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { DEFAULT_IDLE_TTL_SECONDS } from "@menuza/orpc-server/auth";
import { db, unscoped } from "@menuza/db";
import { requireSession } from "../session/support.ts";
import { toPanelTimestamp } from "../panel/format.ts";
import { currentSessionDigest } from "./support.ts";

const os = implement(
  tenantContractObject.account.listSessions,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The account's live sessions, most recently used first.
 *
 * Only the `tenant` namespace is listed: the commerce session is buyer-facing
 * and is a different product surface (addresses ticket). Revoked and expired
 * rows are filtered out rather than shown as dead, because the list exists to
 * answer "should I kill this one?" and a dead row is never the answer.
 */
export const listSessionsImpl = os.handler(async ({ context }) => {
  const session = await requireSession(context.reqHeaders);

  const ownDigest = currentSessionDigest(session.id);

  const rows = await unscoped(() =>
    db.orm.public.Session.where({ memberId: session.memberId, namespace: "tenant" }).all(),
  );

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  const live = rows.filter(
    (row) =>
      row.revokedAt === null &&
      Temporal.PlainDateTime.compare(row.expiresAt, now) > 0 &&
      // The idle window is the same one `getSession` enforces. Repeating the
      // rule here (rather than only listing what it would accept) keeps the UI
      // from offering to revoke a session that is already dead.
      Temporal.PlainDateTime.compare(
        row.lastUsedAt,
        now.subtract({ seconds: DEFAULT_IDLE_TTL_SECONDS }),
      ) > 0,
  );

  live.sort((left, right) => Temporal.PlainDateTime.compare(right.lastUsedAt, left.lastUsedAt));

  return {
    sessions: live.map((row) => ({
      // The row id is the token digest — safe to display and to send back.
      id: row.id,
      current: row.id === ownDigest,
      createdAt: toPanelTimestamp(row.createdAt),
      lastUsedAt: toPanelTimestamp(row.lastUsedAt),
      expiresAt: toPanelTimestamp(row.expiresAt),
    })),
  };
});

export type ListSessionsImpl = typeof listSessionsImpl;
