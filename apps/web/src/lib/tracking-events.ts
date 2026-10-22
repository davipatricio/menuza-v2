export type TrackingMilestone =
  | "ordered"
  | "dispatched"
  | "in-transit"
  | "out-for-delivery"
  | "delivered";

/** A milestone, or a problem the carrier reports: a failed attempt, a delay. */
export type TrackingStatus = TrackingMilestone | "exception";

export interface TrackingEvent {
  /** The carrier's event id — the same update sent twice is shown once. */
  id: string;
  status: TrackingStatus;
  /** ISO timestamp of when it happened, not when the webhook arrived. */
  at: string;
  /** "Departed facility", "Delivery attempted — no one home". */
  description?: string;
  /** "Leipzig, DE". */
  location?: string;
}

export interface TrackingStep {
  status: TrackingMilestone;
  label: string;
}

export const DEFAULT_TRACKING_STEPS: TrackingStep[] = [
  { status: "ordered", label: "Ordered" },
  { status: "dispatched", label: "Dispatched" },
  { status: "in-transit", label: "In transit" },
  { status: "out-for-delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
];

/**
 * The events once, in the order they happened. A repeated id keeps its last
 * copy (a carrier's correction); equal times keep the milestone order.
 */
export function sortTrackingEvents(
  events: TrackingEvent[],
  steps: TrackingStep[] = DEFAULT_TRACKING_STEPS,
) {
  const byId = new Map<string, TrackingEvent>();

  for (const event of events) byId.set(event.id, event);

  const rank = (s: TrackingStatus) =>
    s === "exception" ? steps.length : steps.findIndex((step) => step.status === s);

  return [...byId.values()].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || rank(a.status) - rank(b.status),
  );
}

export interface TrackingProgress {
  /** Index into the steps of the milestone the parcel is at; -1 before any. */
  current: number;
  /** When each milestone was first reached, if the carrier said so. */
  reachedAt: Partial<Record<TrackingMilestone, string>>;
  /** The latest event, when it's a problem reported after the last milestone. */
  issue: TrackingEvent | null;
  delivered: boolean;
}

/** Where the parcel is, from events in any order. */
export function trackingProgress(
  events: TrackingEvent[],
  steps: TrackingStep[] = DEFAULT_TRACKING_STEPS,
): TrackingProgress {
  const sorted = sortTrackingEvents(events, steps);
  const reachedAt: TrackingProgress["reachedAt"] = {};
  let current = -1;
  let issue: TrackingEvent | null = null;

  for (const event of sorted) {
    if (event.status === "exception") {
      issue = event;
      continue;
    }

    const index = steps.findIndex((s) => s.status === event.status);

    if (index === -1) continue;
    reachedAt[event.status] ??= event.at;
    // The carrier's latest word is the truth — even a step back, after a re-route.
    current = index;
    issue = null;
  }

  return { current, reachedAt, issue, delivered: steps[current]?.status === "delivered" };
}
