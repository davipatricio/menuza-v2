import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type {
  RequestHeadersHandlerPluginContext,
  ResponseHeadersHandlerPluginContext,
} from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { createSession, hashPassword } from "@menuza/orpc-server/auth";
import { db, unscoped } from "@menuza/db";
import { assertSameOrigin, conflict, toSessionMember } from "./support.ts";

const os = implement(tenantContractObject.session.register).$context<
  RequestHeadersHandlerPluginContext & ResponseHeadersHandlerPluginContext
>();

/**
 * Creates a management account (a global `Member`) and opens a
 * `menuza_tenant_sid` session in the same round trip, so the wizard's next
 * routes are authenticated. A brand-new account has no membership yet: the
 * invite/create-store fork gives it one.
 *
 * Duplicate e-mail throws the generic `CONFLICT` (no "already registered"
 * wording) so the endpoint does not confirm which addresses have accounts.
 */
export const registerImpl = os.handler(async ({ input, context }) => {
  assertSameOrigin(context.reqHeaders);

  const email = input.email.trim().toLowerCase();

  // Hash before the existence check: hashing is the slow step, so skipping it
  // for a known e-mail would leak account existence through response time.
  const passwordHash = await hashPassword(input.password);

  const existing = await unscoped(() => db.orm.public.Member.where({ email }).first());

  if (existing) throw conflict();

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  let member;

  try {
    member = await unscoped(() =>
      db.orm.public.Member.create({
        id: randomUUID(),
        email,
        name: input.name,
        kind: "human",
        passwordHash,
        birthdate: Temporal.PlainDateTime.from(`${input.birthdate}T00:00:00`),
        updatedAt: now,
      }),
    );
  } catch (error) {
    // A concurrent signup for the same address races past the check above and
    // lands on the unique index; present it as the same generic conflict.
    if (error instanceof Error && /Member_email_key|duplicate key/i.test(error.message)) {
      throw conflict();
    }

    throw error;
  }

  const { cookie } = await createSession({
    memberId: member.id,
    namespace: "tenant",
    // `Secure` would break local HTTP development; production is HTTPS-only.
    secure: process.env.NODE_ENV === "production",
  });

  // Appends rather than sets: `Set-Cookie` may already carry other entries.
  context.resHeaders?.append("set-cookie", cookie);

  return {
    member: toSessionMember(member),
    memberships: [],
  };
});

export type RegisterImpl = typeof registerImpl;
