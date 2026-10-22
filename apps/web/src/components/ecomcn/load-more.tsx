"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

const subscribeNothing = () => () => {};

/**
 * Your locale, or the visitor's once hydrated. The server can't know the
 * visitor's locale, and its HTML must match the first client render — a
 * server in en-IN prints "1,24,000" where an en-US browser prints
 * "124,000" — so until hydration it formats in en-US.
 */
function useFormatLocale(locale?: string) {
  const hydrated = React.useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  return locale ?? (hydrated ? undefined : "en-US");
}

export interface LoadMoreProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Items currently rendered. */
  shown: number;
  /** Total results, if your backend knows it. Drives the count and the progress rule. */
  total?: number;
  /** Defaults to `shown < total`. Pass it when `total` is unknown. */
  hasMore?: boolean;
  loading?: boolean;
  /**
   * Called when more results are needed. The return value is ignored, so a
   * `Promise` is allowed but its rejection is not surfaced by this component.
   */
  onLoadMore: () => void;
  /**
   * `button` — only on click (the default).
   * `hybrid` — the first page needs a click, later pages load as the shopper nears the end.
   * `infinite` — always loads on approach. Keeps the footer out of reach; use sparingly.
   */
  mode?: "button" | "hybrid" | "infinite";
  /** Shown with a retry button when the last load failed. */
  error?: string | null;
  /**
   * The id of the list this appends to (e.g. your ProductGrid). After a
   * click, focus moves to the first new item, so a keyboard user carries on
   * from where the new results start instead of back at the button.
   */
  controls?: string;
  label?: string;
  noun?: { one: string; other: string };
  locale?: string;
  /** How early infinite modes start loading. */
  rootMargin?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function LoadMore({
  shown,
  total,
  hasMore: hasMoreProp,
  loading = false,
  onLoadMore,
  mode = "button",
  error,
  controls,
  label = "Load more",
  noun = { one: "product", other: "products" },
  locale: localeProp,
  rootMargin = "600px 0px",
  className,
  ...props
}: LoadMoreProps) {
  const locale = useFormatLocale(localeProp);
  const hasMore = hasMoreProp ?? (total !== undefined ? shown < total : true);
  const format = React.useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const plural = React.useMemo(() => new Intl.PluralRules(locale), [locale]);
  const word = (n: number) => (plural.select(n) === "one" ? noun.one : noun.other);

  const status =
    total !== undefined
      ? `Showing ${format.format(shown)} of ${format.format(total)} ${word(total)}`
      : `Showing ${format.format(shown)} ${word(shown)}`;

  // Silent until the shopper has asked for more, so the page doesn't speak
  // on load; afterwards the live region announces each new count once.
  const [requested, setRequested] = React.useState(false);
  // Hybrid mode arms itself on the first click — and disarms when the list
  // starts over (a filter or sort change), so every new result set asks once.
  const [armedAt, setArmedAt] = React.useState<number | null>(null);
  const armed = armedAt !== null && shown >= armedAt;

  const auto =
    hasMore && !loading && !error && (mode === "infinite" || (mode === "hybrid" && armed));

  // One request per page: if a load returns nothing new, don't hammer it.
  const requestedAt = React.useRef<number | null>(null);
  const focusFrom = React.useRef<number | null>(null);
  const sentinel = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(
    (from: "click" | "auto") => {
      if (from === "auto" && requestedAt.current === shown) return;
      requestedAt.current = shown;
      setRequested(true);

      if (from === "click") {
        focusFrom.current = shown;
        setArmedAt(shown);
      }

      void onLoadMore();
    },
    [onLoadMore, shown],
  );

  // Re-created whenever loading settles: a fresh observer reports the current
  // intersection immediately, so a sentinel that is *still* on screen after a
  // fast load triggers the next page instead of waiting for a scroll.
  React.useEffect(() => {
    const node = sentinel.current;

    if (!auto || !node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load("auto");
      },
      { rootMargin },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [auto, load, rootMargin]);

  // After a click-triggered load lands, move focus to the first new item.
  React.useEffect(() => {
    const from = focusFrom.current;

    if (from === null || shown <= from || !controls) return;
    focusFrom.current = null;
    const item = document.getElementById(controls)?.children[from] as HTMLElement | undefined;

    if (!item) return;
    const target = item.matches(FOCUSABLE) ? item : item.querySelector<HTMLElement>(FOCUSABLE);

    if (target) {
      target.focus();
    } else {
      item.tabIndex = -1;
      item.focus();
    }
  }, [shown, controls]);

  const progress = total ? Math.min(1, shown / total) : undefined;

  return (
    <div ref={sentinel} data-slot="load-more" className={cn("text-sm", className)} {...props}>
      {/* The rule is the progress bar: filled to the share already shown. */}
      <div aria-hidden className="h-px w-full bg-border">
        {progress !== undefined ? (
          <div
            className="h-px bg-foreground transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-4">
        <p className="text-muted-foreground tabular-nums">{status}</p>

        {error ? null : hasMore ? (
          <Button
            type="button"
            variant="outline"
            aria-controls={controls}
            disabled={loading}
            onClick={() => load("click")}
            className="w-full sm:w-auto"
          >
            {loading ? "Loading…" : label}
          </Button>
        ) : (
          <p className="text-muted-foreground">
            {total !== undefined
              ? `That’s all ${format.format(total)} ${word(total)}.`
              : "That’s everything."}
          </p>
        )}
      </div>

      {error ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => load("click")}>
            Try again
          </Button>
        </div>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {requested && !loading ? status : ""}
      </span>
    </div>
  );
}
