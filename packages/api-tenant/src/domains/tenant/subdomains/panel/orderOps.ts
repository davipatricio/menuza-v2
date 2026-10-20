/**
 * Shared pieces of the panel's order writes (MEN-264).
 *
 * The legal moves live in the pure engine (`@menuza/shared/commerce`): this file
 * only turns the caller's role into the capability set the engine reads and
 * shapes the result the dashboard renders. No rule is re-derived here.
 */
import {
  nextTransitions,
  type TransitionActor,
  type TransitionRule,
} from "@menuza/shared/commerce";
import { TENANT_CAPABILITIES, can, type TenantRole } from "@menuza/orpc-server/auth";
import type { PanelOrderTransition } from "@menuza/shared/tenant";

/** The engine's view of the caller: role expanded into capability names. */
export function actorOf(memberId: string, role: TenantRole): TransitionActor {
  return {
    memberId,
    capabilities: TENANT_CAPABILITIES.filter((capability) => can(role, capability)),
  };
}

/**
 * Every move that is legal on both axes for this caller. The dashboard renders
 * exactly these buttons, so a `staff` member never sees a refund it would be
 * refused.
 */
export function transitionsOf(
  order: { financialStatus: string; fulfilmentStatus: string },
  actor: TransitionActor,
): PanelOrderTransition[] {
  const rules = [
    ...nextTransitions("financial", order.financialStatus, actor),
    ...nextTransitions("fulfilment", order.fulfilmentStatus, actor),
  ];

  return rules.map(toPanelTransition);
}

export function toPanelTransition(rule: TransitionRule): PanelOrderTransition {
  return {
    axis: rule.axis,
    to: rule.to,
    requiresReason: rule.requiresReason,
  };
}
