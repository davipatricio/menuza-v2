"use client";

import * as React from "react";
import { Check, Star } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/*
 * The reviews section of a product page: the average, a star histogram that
 * filters the list, a fit scale, and the reviews themselves.
 *
 *   <ReviewSummary reviews={reviews} />
 *
 *   <ReviewSummary reviews={reviews} distribution={[4, 3, 18, 61, 226]}>   or composed
 *     <ReviewSummaryScore />
 *     <ReviewSummaryHistogram />
 *     <ReviewSummaryFit />
 *     <ReviewSummaryList />
 *   </ReviewSummary>
 *
 * Every histogram row is a button: it filters the list to that rating, and
 * says so in words. The fit scale has a text equivalent ("Runs a little
 * small") on screen, not only a marker. Motion does the moving: the active
 * row's rule slides between rows, the list grows and shrinks to its measured
 * height as it filters, and reviews fade in and out — a fade alone under
 * reduced motion. `useReviewSummary()` reads the shared state.
 */

export interface Review {
  id: string;
  /** 1 to 5. */
  rating: number;
  title?: string;
  body: React.ReactNode;
  author: string;
  /** ISO date, "2026-09-14". Shown as a calendar date, the same in every time zone. */
  date: string;
  /** Bought it: shown as a "Verified buyer" badge. */
  verified?: boolean;
  /** -1 runs small, 0 true to size, 1 runs large. */
  fit?: number;
  /** What they bought: "Tan · EU 41". */
  variant?: string;
}

/** Review counts per rating, 1 star first: `[4, 3, 18, 61, 226]`. */
export type ReviewDistribution = [number, number, number, number, number];

/** The same settle curve as the other ecomcn morphs: no bounce, an editorial ease. */
const MORPH = { duration: 0.45, ease: [0.2, 0, 0, 1] } as const;

/** The words for a fit score, from -1 (small) to 1 (large). */
function defaultFitLabel(fit: number) {
  if (fit <= -0.6) return "Runs small";

  if (fit <= -0.2) return "Runs a little small";

  if (fit < 0.2) return "True to size";

  if (fit < 0.6) return "Runs a little large";

  return "Runs large";
}

const subscribeNothing = () => () => {};

/**
 * The locale to format with. Yours when you pass one. Otherwise the
 * visitor's — but only once hydrated: the server cannot know it, and its HTML
 * ("Sep 21, 2026") must match the first client render, not the browser's
 * "21 Sept 2026". Until then, en-US.
 */
function useFormatLocale(locale?: string) {
  const hydrated = React.useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  return locale ?? (hydrated ? undefined : "en-US");
}

function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const controlled = value !== undefined;

  const set = React.useCallback(
    (next: T) => {
      if (!controlled) setUncontrolled(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );

  return [controlled ? value : uncontrolled, set] as const;
}

/* ─── context ──────────────────────────────────────────────────────────── */

export interface ReviewSummaryContextValue {
  reviews: Review[];
  /** The reviews under the current filter. */
  filtered: Review[];
  distribution: ReviewDistribution;
  total: number;
  /** 0 when there are no reviews. */
  average: number;
  /** Mean fit, -1 to 1; undefined when no review rated the fit. */
  fit?: number;
  fitCount: number;
  fitLabel: (fit: number) => string;
  /** The rating the list is filtered to, or null for all. */
  rating: number | null;
  setRating: (rating: number | null) => void;
  /** How many of `filtered` are on show; "Show more" raises it. */
  visible: number;
  showMore: () => void;
  /** The locale formatting uses: yours, or the visitor's once hydrated. */
  locale?: string;
  /** Formats a 0–5 score for the locale: "4.6". */
  formatScore: (score: number) => string;
  formatDate: (iso: string) => string;
  loading: boolean;
}

const ReviewSummaryContext = React.createContext<ReviewSummaryContextValue | null>(null);

export function useReviewSummary() {
  const context = React.useContext(ReviewSummaryContext);

  if (!context) {
    throw new Error("useReviewSummary must be used within <ReviewSummary>.");
  }

  return context;
}

/* ─── root ─────────────────────────────────────────────────────────────── */

export interface ReviewSummaryProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  reviews: Review[];
  /**
   * Counts per rating across every review, when `reviews` is one page of
   * many. Defaults to counting `reviews`.
   */
  distribution?: ReviewDistribution;
  /** Defaults to the mean of `distribution`. */
  average?: number;
  /** Overall fit, -1 to 1. Defaults to the mean of the reviews' `fit`. */
  fit?: number;
  /** "Runs a little small" for a score — your words, or another language. */
  fitLabel?: (fit: number) => string;
  /** The rating to filter to, or null for all. */
  rating?: number | null;
  defaultRating?: number | null;
  /** Fetch that rating's reviews here when they are paginated server-side. */
  onRatingChange?: (rating: number | null) => void;
  /** Reviews shown before "Show more". Defaults to 4. */
  pageSize?: number;
  title?: React.ReactNode;
  /** Under the score: a "Write a review" link, say. */
  action?: React.ReactNode;
  locale?: string;
  loading?: boolean;
}

export function ReviewSummary({
  reviews,
  distribution: distributionProp,
  average: averageProp,
  fit: fitProp,
  fitLabel = defaultFitLabel,
  rating: ratingProp,
  defaultRating = null,
  onRatingChange,
  pageSize = 4,
  title = "Reviews",
  action,
  locale: localeProp,
  loading = false,
  className,
  children,
  ...props
}: ReviewSummaryProps) {
  const locale = useFormatLocale(localeProp);
  const [rating, setRatingState] = useControllableState(ratingProp, defaultRating, onRatingChange);
  const [visible, setVisible] = React.useState(pageSize);
  const headingId = React.useId();

  // A new filter starts from the first page again.
  const setRating = React.useCallback(
    (next: number | null) => {
      setVisible(pageSize);
      setRatingState(next);
    },
    [pageSize, setRatingState],
  );

  const context = React.useMemo<ReviewSummaryContextValue>(() => {
    const distribution =
      distributionProp ??
      reviews.reduce<ReviewDistribution>(
        (counts, review) => {
          const star = Math.min(5, Math.max(1, Math.round(review.rating)));
          counts[star - 1] = (counts[star - 1] ?? 0) + 1;

          return counts;
        },
        [0, 0, 0, 0, 0],
      );

    const total = distribution.reduce((sum, n) => sum + n, 0);

    const average =
      averageProp ?? (total ? distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / total : 0);

    const fits = reviews.map((r) => r.fit).filter((f): f is number => typeof f === "number");

    const fit =
      fitProp ?? (fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : undefined);

    const score = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

    // UTC: "2026-09-14" is a calendar date, and must not become the 13th
    // west of Greenwich — or differ between the server and the browser.
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });

    return {
      reviews,
      filtered: rating === null ? reviews : reviews.filter((r) => Math.round(r.rating) === rating),
      distribution,
      total,
      average,
      fit,
      fitCount: fits.length,
      fitLabel,
      rating,
      setRating,
      visible,
      showMore: () => setVisible((v) => v + pageSize),
      locale,
      formatScore: (n) => score.format(n),
      formatDate: (iso) => {
        const parsed = new Date(iso);

        return Number.isNaN(parsed.getTime()) ? iso : date.format(parsed);
      },
      loading,
    };
  }, [
    reviews,
    distributionProp,
    averageProp,
    fitProp,
    fitLabel,
    rating,
    setRating,
    visible,
    pageSize,
    locale,
    loading,
  ]);

  return (
    <ReviewSummaryContext.Provider value={context}>
      <MotionConfig reducedMotion="user">
        <section
          aria-labelledby={headingId}
          aria-busy={loading || undefined}
          data-slot="review-summary"
          className={cn("w-full", className)}
          {...props}
        >
          <h2 id={headingId} className="border-b pb-4 text-2xl">
            {title}
          </h2>
          {children ?? (
            <div className="grid gap-10 pt-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-14">
              <div className="flex flex-col gap-8">
                <ReviewSummaryScore />
                <ReviewSummaryHistogram />
                <ReviewSummaryFit />
                {action}
              </div>
              <ReviewSummaryList />
            </div>
          )}
        </section>
      </MotionConfig>
    </ReviewSummaryContext.Provider>
  );
}

/* ─── parts ────────────────────────────────────────────────────────────── */

/** Five stars, filled to the score; partial stars are clipped, not rounded. */
function Stars({ score, className }: { score: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="review-summary-stars"
      className={cn("relative inline-flex", className)}
    >
      <span className="flex gap-0.5 text-border">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="size-[1em] fill-current" />
        ))}
      </span>
      <span
        className="absolute inset-y-0 left-0 flex gap-0.5 overflow-hidden text-foreground"
        style={{ width: `${(Math.min(5, Math.max(0, score)) / 5) * 100}%` }}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="size-[1em] shrink-0 fill-current" />
        ))}
      </span>
    </span>
  );
}

/** The average, large — the number is the headline — and what it is based on. */
export function ReviewSummaryScore({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { average, total, formatScore, locale, loading } = useReviewSummary();

  if (loading) {
    return (
      <div aria-hidden className={cn("flex flex-col gap-3", className)}>
        <span className="h-14 w-24 animate-pulse bg-muted" />
        <span className="h-3 w-32 animate-pulse bg-muted" />
      </div>
    );
  }

  const count = new Intl.NumberFormat(locale).format(total);

  return (
    <div
      data-slot="review-summary-score"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      {total ? (
        <>
          <p className="flex items-baseline gap-3">
            <span className="text-[60px] leading-none tracking-tight tabular-nums">
              {formatScore(average)}
            </span>
            <span className="text-sm text-muted-foreground">out of 5</span>
          </p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Stars score={average} className="text-base" />
            <span className="tabular-nums">
              {count} {total === 1 ? "review" : "reviews"}
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="text-2xl">No reviews yet.</p>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Bought one? Yours would be the first — and the one the next buyer reads.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One row per rating, 5 to 1. Each row is a button that filters the list
 * and reads out as "5 stars, 226 reviews, 72%". The active row carries a
 * rule that slides from row to row.
 */
export function ReviewSummaryHistogram({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { distribution, total, rating, setRating, locale, loading } = useReviewSummary();
  const reduce = useReducedMotion();
  const scope = React.useId();

  if (!total && !loading) return null;
  const count = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent" });

  return (
    <div
      role="group"
      aria-label="Filter reviews by rating"
      data-slot="review-summary-histogram"
      className={cn("flex flex-col", className)}
      {...props}
    >
      {[5, 4, 3, 2, 1].map((star) => {
        const n = distribution[star - 1] ?? 0;
        const share = total ? n / total : 0;
        const active = rating === star;

        return (
          <Button
            key={star}
            type="button"
            variant="ghost"
            aria-pressed={active}
            disabled={loading || n === 0}
            onClick={() => setRating(active ? null : star)}
            className="relative h-9 w-full justify-start gap-3 rounded-none px-2 font-normal text-foreground hover:bg-secondary disabled:opacity-40"
          >
            {active ? (
              <motion.span
                aria-hidden
                layoutId={reduce ? undefined : `${scope}-active`}
                initial={reduce ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={reduce ? { duration: 0.15 } : MORPH}
                className="absolute inset-y-1 left-0 w-0.5 bg-foreground"
              />
            ) : null}
            <span className="flex w-8 shrink-0 items-center gap-1 tabular-nums">
              {star}
              <Star aria-hidden className="size-3 fill-current" />
            </span>
            <span
              aria-hidden
              className="relative h-1.5 min-w-0 flex-1 overflow-hidden bg-secondary"
            >
              <motion.span
                className="absolute inset-0 origin-left bg-foreground"
                initial={false}
                animate={{ scaleX: loading ? 0 : share }}
                transition={reduce ? { duration: 0 } : MORPH}
              />
            </span>
            <span
              aria-hidden
              className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
            >
              {loading ? "" : count.format(n)}
            </span>
            <span className="sr-only">
              {`${star} ${star === 1 ? "star" : "stars"}, ${count.format(n)} ${n === 1 ? "review" : "reviews"}, ${percent.format(share)}`}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

/** Which of the five steps, small to large, a fit score falls in — as the words do. */
function fitStep(fit: number) {
  if (fit <= -0.6) return 0;

  if (fit <= -0.2) return 1;

  if (fit < 0.2) return 2;

  if (fit < 0.6) return 3;

  return 4;
}

/**
 * How the fit runs, as reviewers reported it: five fixed steps from small to
 * large with the one it lands on filled, and the reading in words above.
 * A gauge, not a control — no handle to grab, nothing to drag. Screen
 * readers get it as a meter with the words as its value.
 */
export function ReviewSummaryFit({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { fit, fitCount, fitLabel, locale, loading } = useReviewSummary();
  const reduce = useReducedMotion();
  const scope = React.useId();

  if (fit === undefined || loading) return null;
  const clamped = Math.min(1, Math.max(-1, fit));
  const label = fitLabel(clamped);
  const step = fitStep(clamped);
  const ratings = `${new Intl.NumberFormat(locale).format(fitCount)} ${fitCount === 1 ? "rating" : "ratings"}`;

  return (
    <div data-slot="review-summary-fit" className={cn("flex flex-col gap-3", className)} {...props}>
      <p className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-xs font-medium tracking-[0.14em] uppercase">Fit</span>
        <span>
          {label}
          <span className="text-muted-foreground"> · {ratings}</span>
        </span>
      </p>
      <div
        role="meter"
        aria-label="Fit"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={Number(clamped.toFixed(2))}
        aria-valuetext={`${label}, from ${ratings}`}
        className="grid grid-cols-5 gap-0.5"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="relative h-1.5 bg-secondary">
            {i === step ? (
              <motion.span
                layoutId={reduce ? undefined : `${scope}-fit`}
                initial={reduce ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={reduce ? { duration: 0.15 } : MORPH}
                className="absolute inset-0 bg-foreground"
              />
            ) : null}
          </span>
        ))}
      </div>
      <p aria-hidden className="grid grid-cols-5 text-[11px] tracking-wide text-muted-foreground">
        <span>Small</span>
        <span className="col-start-3 text-center">True to size</span>
        <span className="col-start-5 text-right">Large</span>
      </p>
    </div>
  );
}

/** Follows its content's height, so the panel grows and shrinks rather than jumps. */
function useMeasuredHeight() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | "auto">("auto");
  React.useLayoutEffect(() => {
    const node = ref.current;

    if (!node) return;

    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry?.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight),
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
}

/**
 * The reviews, filtered by the histogram. Filtering says what is showing and
 * offers the way back; the list grows to its new height with Motion.
 */
export function ReviewSummaryList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { filtered, total, rating, setRating, visible, showMore, loading } = useReviewSummary();
  const reduce = useReducedMotion();
  const [inner, height] = useMeasuredHeight();
  const shown = filtered.slice(0, visible);

  if (!total && !loading) return null;

  return (
    <div data-slot="review-summary-list" className={cn("min-w-0", className)} {...props}>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3 border-b pb-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {loading
            ? "Loading reviews…"
            : rating === null
              ? `Showing ${shown.length} of ${filtered.length}`
              : `${filtered.length} ${filtered.length === 1 ? "review" : "reviews"} with ${rating} ${rating === 1 ? "star" : "stars"}`}
        </p>
        {rating !== null ? (
          <Button
            type="button"
            variant="link"
            onClick={() => setRating(null)}
            className="h-auto rounded-none p-0 text-sm text-foreground"
          >
            Show all reviews
          </Button>
        ) : null}
      </div>

      <motion.div
        initial={false}
        animate={{ height }}
        transition={reduce ? { duration: 0 } : MORPH}
        className="overflow-hidden"
      >
        <div ref={inner}>
          {loading ? (
            <ul aria-hidden>
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="flex flex-col gap-3 border-b py-6">
                  <span className="h-3 w-20 animate-pulse bg-muted" />
                  <span className="h-4 w-1/2 animate-pulse bg-muted" />
                  <span className="h-3 w-full animate-pulse bg-muted" />
                  <span className="h-3 w-4/5 animate-pulse bg-muted" />
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              <AnimatePresence initial={false} mode="popLayout">
                {shown.map((review) => (
                  <motion.li
                    key={review.id}
                    layout={reduce ? false : "position"}
                    initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={reduce ? { duration: 0.15 } : MORPH}
                    className="border-b"
                  >
                    <ReviewSummaryItem review={review} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </motion.div>

      {!loading && shown.length < filtered.length ? (
        <Button
          type="button"
          variant="outline"
          onClick={showMore}
          className="mt-6 h-11 w-full rounded-none text-xs font-medium tracking-[0.14em] uppercase shadow-none"
        >
          Show more reviews
        </Button>
      ) : null}
    </div>
  );
}

/** One review: rating, title, body, then who and when — and whether they bought it. */
export function ReviewSummaryItem({
  review,
  className,
  ...props
}: { review: Review } & React.HTMLAttributes<HTMLElement>) {
  const { formatDate, formatScore } = useReviewSummary();

  return (
    <article
      data-slot="review-summary-item"
      className={cn("flex flex-col gap-3 py-6", className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        <Stars score={review.rating} className="text-sm" />
        <span className="sr-only">Rated {formatScore(review.rating)} out of 5</span>
        {review.variant ? (
          <span className="text-xs text-muted-foreground">{review.variant}</span>
        ) : null}
      </div>
      {review.title ? <h3 className="text-base font-medium">{review.title}</h3> : null}
      <div className="max-w-prose text-sm leading-[1.7] text-muted-foreground [&_p+p]:mt-3">
        {review.body}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <span className="text-foreground">{review.author}</span>
        <time dateTime={review.date}>{formatDate(review.date)}</time>
        {review.verified ? (
          <Badge variant="outline" className="rounded-none font-normal tracking-wide">
            <Check aria-hidden />
            Verified buyer
          </Badge>
        ) : null}
      </p>
    </article>
  );
}
