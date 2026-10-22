"use client";

import * as React from "react";
import { ArrowUpRight, Check, CircleAlert } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_TRACKING_STEPS,
  sortTrackingEvents,
  trackingProgress,
  type TrackingEvent,
  type TrackingStatus,
  type TrackingStep,
} from "@/lib/tracking-events";
import { cn } from "cn";

/*
 * Where the parcel is: a status chip, when it arrives, a vertical timeline
 * of the shipment's milestones, and the carrier's updates under it.
 *
 *   <OrderTracking events={carrierEvents} carrier={{ name: "UPS", trackingNumber, url }} estimate={{ from, to }} />
 *
 * Carrier webhooks arrive out of order and sometimes twice, so the block
 * never trusts arrival order: events are de-duplicated by id and sorted by
 * the time they happened — `sortTrackingEvents` and `trackingProgress` in
 * `@/lib/tracking-events`, a file with no "use client", so your webhook
 * handler can run the same code.
 * The latest milestone is the current node — ringed, with a live pulse;
 * milestones before it are solid ink; those to come are hollow grey. State
 * is never colour alone: a check, a ring, words. When the rule between two
 * nodes fills it draws down to the next (Motion; a fade under reduced
 * motion), and the full update log grows to its measured height.
 * Timestamps show in the visitor's own time zone once hydrated; calendar
 * dates (the estimate) in UTC, so they never slip a day. The estimate is two
 * formatted days joined with a dash, not `formatRange`, whose spacing
 * differs between Node's ICU and the browser's.
 */

export type {
  TrackingEvent,
  TrackingMilestone,
  TrackingStatus,
  TrackingStep,
} from "@/lib/tracking-events";

/** The same settle curve as the other ecomcn morphs: no bounce, an editorial ease. */
const MORPH = { duration: 0.45, ease: [0.2, 0, 0, 1] } as const;

const FADE = { duration: 0.15 } as const;

const subscribeNothing = () => () => {};

/* ─── block ────────────────────────────────────────────────────────────── */

export interface OrderTrackingProps extends React.HTMLAttributes<HTMLElement> {
  /** The carrier's updates, in any order, duplicates and all. */
  events: TrackingEvent[];
  carrier?: { name: string; trackingNumber?: string; url?: string };
  /** Calendar dates, "2026-10-21": the window it should arrive in. */
  estimate?: { from: string; to?: string };
  /** Your milestones, if not the five standard ones. */
  steps?: TrackingStep[];
  /** `undefined` follows the visitor's locale, once hydrated. */
  locale?: string;
  /** How many updates show before "Show all". Defaults to 3. */
  visibleUpdates?: number;
  loading?: boolean;
}

export function OrderTracking({
  events,
  carrier,
  estimate,
  steps = DEFAULT_TRACKING_STEPS,
  locale: localeProp,
  visibleUpdates = 3,
  loading = false,
  className,
  ...props
}: OrderTrackingProps) {
  const hydrated = React.useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const reduce = useReducedMotion();
  const uid = React.useId();
  const locale = localeProp ?? (hydrated ? undefined : "en-US");
  const timeZone = hydrated ? undefined : "UTC";
  const [showAll, setShowAll] = React.useState(false);

  const sorted = React.useMemo(() => sortTrackingEvents(events, steps), [events, steps]);
  const progress = React.useMemo(() => trackingProgress(events, steps), [events, steps]);

  const day = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    [locale],
  );

  const stamp = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }),
    [locale, timeZone],
  );

  const calendar = (iso: string) => new Date(`${iso}T00:00:00Z`);

  const arrival = estimate
    ? !estimate.to || estimate.to === estimate.from
      ? day.format(calendar(estimate.from))
      : `${day.format(calendar(estimate.from))} – ${day.format(calendar(estimate.to))}`
    : null;

  const currentStep = steps[progress.current];
  const deliveredAt = progress.reachedAt.delivered;

  const headline: React.ReactNode = progress.delivered ? (
    deliveredAt ? (
      <>
        Delivered{" "}
        <time dateTime={deliveredAt} suppressHydrationWarning>
          {stamp.format(new Date(deliveredAt))}
        </time>
      </>
    ) : (
      "Delivered"
    )
  ) : arrival ? (
    `Arrives ${arrival}`
  ) : (
    (currentStep?.label ?? "Preparing your order")
  );

  const chip = progress.issue ? "Needs attention" : (currentStep?.label ?? "Not shipped yet");

  // Newest first in the log.
  const log = [...sorted].reverse();
  const shown = showAll ? log : log.slice(0, visibleUpdates);

  const labelFor = (status: TrackingStatus) =>
    status === "exception" ? "Update" : (steps.find((s) => s.status === status)?.label ?? status);

  if (loading) {
    return (
      <section
        data-slot="order-tracking"
        aria-busy
        className={cn("flex flex-col gap-8", className)}
        {...props}
      >
        <span className="sr-only" role="status">
          Loading tracking
        </span>
        <div aria-hidden className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24 rounded-none" />
          <Skeleton className="h-7 w-64 rounded-none" />
          <Skeleton className="h-3.5 w-48 rounded-none" />
        </div>
        <div aria-hidden className="flex flex-col gap-7">
          {steps.map((s) => (
            <div key={s.status} className="flex items-center gap-4">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-3.5 w-32 rounded-none" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <section
        data-slot="order-tracking"
        aria-labelledby={`${uid}-title`}
        className={cn("flex flex-col gap-8", className)}
        {...props}
      >
        {/* Status, when, and who's carrying it. */}
        <header data-slot="order-tracking-header" className="flex flex-col gap-3">
          <Badge
            variant={progress.issue ? "destructive" : progress.delivered ? "default" : "outline"}
            className="rounded-none px-2 py-0.5 text-[11px] tracking-[0.14em] uppercase"
          >
            {progress.issue ? (
              <CircleAlert aria-hidden />
            ) : progress.delivered ? (
              <Check aria-hidden />
            ) : null}
            {chip}
          </Badge>
          <h2 id={`${uid}-title`} className="text-2xl font-medium tracking-tight tabular-nums">
            {headline}
          </h2>
          {carrier ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="text-foreground">{carrier.name}</span>
              {carrier.trackingNumber ? (
                <span className="font-mono text-[12.5px]">{carrier.trackingNumber}</span>
              ) : null}
              {carrier.url ? (
                <a
                  href={carrier.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
                >
                  Track on {carrier.name}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : null}
            </p>
          ) : null}
          {progress.issue ? (
            <p
              role="status"
              className="flex items-start gap-2 border-l-2 border-destructive py-1 pl-3 text-sm"
            >
              {progress.issue.description ?? "The carrier reported a problem with this delivery."}
              {progress.issue.location ? (
                <span className="text-muted-foreground"> · {progress.issue.location}</span>
              ) : null}
            </p>
          ) : null}
        </header>

        {sorted.length === 0 ? (
          <p
            data-slot="order-tracking-empty"
            className="border-y py-5 text-sm text-muted-foreground"
          >
            Tracking appears here once your order ships
            {arrival ? ` — it should arrive ${arrival}` : ""}.
          </p>
        ) : (
          <>
            {/* The milestones. */}
            <ol data-slot="order-tracking-steps" className="flex flex-col">
              {steps.map((step, i) => {
                const state =
                  i < progress.current ? "done" : i === progress.current ? "current" : "pending";

                const at = progress.reachedAt[step.status];
                const last = i === steps.length - 1;
                const trouble = state === "current" && progress.issue;

                return (
                  <li
                    key={step.status}
                    data-state={state}
                    aria-current={state === "current" ? "step" : undefined}
                    className="relative flex gap-4 pb-7 last:pb-0"
                  >
                    {/* The rule to the next node: grey, filled in ink once passed. */}
                    {!last ? (
                      <span
                        aria-hidden
                        className="absolute top-6 bottom-1 left-[9.5px] w-px bg-border"
                      >
                        <motion.span
                          className="absolute inset-0 origin-top bg-foreground"
                          initial={false}
                          animate={
                            reduce
                              ? { opacity: i < progress.current ? 1 : 0 }
                              : { scaleY: i < progress.current ? 1 : 0 }
                          }
                          transition={reduce ? FADE : MORPH}
                        />
                      </span>
                    ) : null}
                    <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
                      {state === "current" && !progress.delivered ? (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-0 rounded-full motion-safe:animate-ping",
                            trouble ? "bg-destructive/40" : "bg-primary/30",
                          )}
                        />
                      ) : null}
                      <span
                        aria-hidden
                        className={cn(
                          "relative grid size-5 place-items-center rounded-full border",
                          state === "done" && "border-foreground bg-foreground text-background",
                          state === "current" &&
                            (trouble
                              ? "border-destructive bg-background text-destructive ring-2 ring-destructive ring-offset-2 ring-offset-background"
                              : progress.delivered
                                ? "border-foreground bg-foreground text-background"
                                : "border-primary bg-primary ring-2 ring-primary ring-offset-2 ring-offset-background"),
                          state === "pending" && "border-border bg-background",
                        )}
                      >
                        {state === "done" || (state === "current" && progress.delivered) ? (
                          <Check className="size-3" strokeWidth={3} />
                        ) : null}
                        {trouble ? <span className="text-[11px] font-bold">!</span> : null}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className={cn(
                          "text-sm",
                          state === "pending" ? "text-muted-foreground" : "font-medium",
                        )}
                      >
                        {step.label}
                      </span>
                      {at ? (
                        <time
                          dateTime={at}
                          suppressHydrationWarning
                          className="text-[13px] text-muted-foreground tabular-nums"
                        >
                          {stamp.format(new Date(at))}
                        </time>
                      ) : null}
                      <span className="sr-only">
                        {state === "done"
                          ? "done"
                          : state === "current"
                            ? trouble
                              ? "current, needs attention"
                              : "current"
                            : "not yet"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* The carrier's updates, newest first. */}
            <div data-slot="order-tracking-updates" className="flex flex-col">
              <h3 className="border-b pb-2 text-xs tracking-[0.14em] text-muted-foreground uppercase">
                Updates
              </h3>
              <ul id={`${uid}-updates`}>
                <AnimatePresence initial={false}>
                  {shown.map((event) => (
                    <motion.li
                      key={event.id}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={reduce ? FADE : MORPH}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 border-b py-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
                        <time
                          dateTime={event.at}
                          suppressHydrationWarning
                          className="text-muted-foreground tabular-nums"
                        >
                          {stamp.format(new Date(event.at))}
                        </time>
                        <span className="flex flex-col gap-0.5">
                          <span className={cn(event.status === "exception" && "text-destructive")}>
                            {event.description ?? labelFor(event.status)}
                          </span>
                          {event.location ? (
                            <span className="text-[13px] text-muted-foreground">
                              {event.location}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {log.length > visibleUpdates ? (
                <button
                  type="button"
                  aria-expanded={showAll}
                  aria-controls={`${uid}-updates`}
                  onClick={() => setShowAll((s) => !s)}
                  className="mt-3 self-start text-sm underline underline-offset-4 hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {showAll ? "Show fewer updates" : `Show all ${log.length} updates`}
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </MotionConfig>
  );
}
