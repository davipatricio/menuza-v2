import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db, unscoped } from "@menuza/db";
import { assertSameOrigin, requireSession } from "../session/support.ts";

const os = implement(
  tenantContractObject.profile.saveOnboarding,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Records the signup onboarding survey (MEN-225). Upserts on the unique
 * `memberId`, so a member who reopens `/dashboard/signup/perfil` edits their
 * answers instead of creating a second row. `persona` is required at the
 * contract; an unanswered optional is stored as NULL.
 */
export const saveOnboardingImpl = os.handler(async ({ input, context }) => {
  assertSameOrigin(context.reqHeaders);

  const session = await requireSession(context.reqHeaders);

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();
  const segment = input.segment ?? null;
  const referral = input.referral ?? null;

  const existing = await unscoped(() =>
    db.orm.public.MemberOnboarding.where({ memberId: session.memberId }).first(),
  );

  if (existing) {
    await unscoped(() =>
      db.orm.public.MemberOnboarding.where({ memberId: session.memberId }).updateAll({
        persona: input.persona,
        segment,
        referral,
        completedAt: now,
        updatedAt: now,
      }),
    );
  } else {
    await unscoped(() =>
      db.orm.public.MemberOnboarding.create({
        id: randomUUID(),
        memberId: session.memberId,
        persona: input.persona,
        segment,
        referral,
        completedAt: now,
        updatedAt: now,
      }),
    );
  }

  return { persona: input.persona, segment, referral };
});

export type SaveOnboardingImpl = typeof saveOnboardingImpl;
