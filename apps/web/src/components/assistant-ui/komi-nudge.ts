/**
 * A page asks the Komi FAB to surface a contextual hint. Decoupled through a
 * window event because the FAB lives in the dashboard shell, not in the page.
 */
export const KOMI_NUDGE_EVENT = "menuza:komi-nudge";

export type KomiNudgeDetail = { message: string };

export function nudgeKomi(message: string) {
  window.dispatchEvent(new CustomEvent<KomiNudgeDetail>(KOMI_NUDGE_EVENT, { detail: { message } }));
}
