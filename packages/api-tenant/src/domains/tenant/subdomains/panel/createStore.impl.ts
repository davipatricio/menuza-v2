import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db, unscoped } from "@menuza/db";
import {
  assertSameOrigin,
  conflict,
  notFound,
  requireSession,
  toSessionMember,
} from "../session/support.ts";

const os = implement(
  tenantContractObject.panel.createStore,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Creates a store (a `Tenant`) and makes the authenticated caller its `owner`.
 * Reused by the signup wizard's "criar loja" step and by the picker's "Nova
 * loja" card. A taken slug is a `CONFLICT` (the address is public, so this
 * leaks nothing). No `Domain`/subdomain is provisioned here — that is MEN-78.
 */
export const createStoreImpl = os.handler(async ({ input, context }) => {
  assertSameOrigin(context.reqHeaders);

  const session = await requireSession(context.reqHeaders);

  const slug = input.slug.trim().toLowerCase();

  const existing = await unscoped(() => db.orm.public.Tenant.where({ slug }).first());

  if (existing) throw conflict();

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();
  const tenantId = randomUUID();

  try {
    await unscoped(() =>
      db.orm.public.Tenant.create({
        id: tenantId,
        slug,
        displayName: input.displayName,
        updatedAt: now,
      }),
    );
  } catch (error) {
    // A concurrent create for the same slug races past the check above and
    // lands on the unique index; present it as the same conflict.
    if (error instanceof Error && /Tenant_slug_key|duplicate key/i.test(error.message)) {
      throw conflict();
    }

    throw error;
  }

  await unscoped(() =>
    db.orm.public.TenantMembership.create({
      id: randomUUID(),
      memberId: session.memberId,
      tenantId,
      role: "owner",
    }),
  );

  const member = await unscoped(() => db.orm.public.Member.where({ id: session.memberId }).first());

  if (!member) throw notFound();

  return {
    tenantId,
    tenantSlug: slug,
    tenantName: input.displayName,
    role: "owner",
    member: toSessionMember(member),
  };
});

export type CreateStoreImpl = typeof createStoreImpl;
