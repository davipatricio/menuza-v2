"use client";

import * as React from "react";
import { ArrowRight, X } from "lucide-react";

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

export interface EmptyResultsFilter {
  /** Stable key, e.g. `color:sage`. */
  id: string;
  /** What the shopper sees — "Sage", "Up to $80", "In stock only". */
  label: string;
  onRemove?: () => void;
}

export interface EmptyResultsSuggestion {
  /** The one change that helps most, as an action: "Remove “Up to $80”". */
  label: string;
  /** How many results that change brings back. */
  count?: number;
  onApply: () => void;
}

export interface EmptyResultsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** The search term, when there is one. */
  query?: string;
  /** The filters that are on. Named in the headline and removable one by one. */
  filters?: EmptyResultsFilter[];
  suggestion?: EmptyResultsSuggestion;
  onClearAll?: () => void;
  /** Overrides the generated headline. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  locale?: string;
  noun?: { one: string; other: string };
}

/**
 * "No results" tells a shopper nothing. This names what emptied the grid and
 * offers the single change that brings the most back — the difference
 * between a dead end and a detour.
 */
export function EmptyResults({
  query,
  filters = [],
  suggestion,
  onClearAll,
  title,
  description,
  locale: localeProp,
  noun = { one: "product", other: "products" },
  className,
  children,
  ...props
}: EmptyResultsProps) {
  const locale = useFormatLocale(localeProp);

  // Quoted, because filter labels are tokens ("Up to $80", "In stock only")
  // and read badly as bare words in the middle of a sentence.
  const list = new Intl.ListFormat(locale, { type: "conjunction" }).format(
    filters.map((f) => `“${f.label}”`),
  );

  const headline =
    title ??
    (query && filters.length
      ? `Nothing for “${query}” in ${list}.`
      : query
        ? `Nothing for “${query}”.`
        : filters.length
          ? `Nothing matches ${list}.`
          : "Nothing here yet.");

  const counted = (n: number) =>
    `${new Intl.NumberFormat(locale).format(n)} ${
      new Intl.PluralRules(locale).select(n) === "one" ? noun.one : noun.other
    }`;

  return (
    // Left-aligned on purpose. A centred icon-and-sentence empty state is the
    // most reliable tell of a generated interface.
    <div className={cn("flex flex-col items-start gap-5 py-10 sm:py-14", className)} {...props}>
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        No results
      </p>
      <h2 className="max-w-2xl text-2xl leading-tight text-balance sm:text-3xl">{headline}</h2>
      {description ? (
        <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}

      {suggestion ? (
        <Button type="button" onClick={suggestion.onApply} className="h-10 gap-2 text-[13px]">
          {suggestion.label}
          {suggestion.count !== undefined && (
            <span className="tabular-nums opacity-70">· {counted(suggestion.count)}</span>
          )}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      ) : null}

      {filters.some((f) => f.onRemove) || onClearAll ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-muted-foreground">
            {suggestion ? "Or remove one:" : "Remove one:"}
          </span>
          {filters.map((filter) =>
            filter.onRemove ? (
              <button
                key={filter.id}
                type="button"
                onClick={filter.onRemove}
                className="group inline-flex h-7 items-center gap-1.5 rounded-sm border bg-secondary/60 pr-1.5 pl-2 text-xs transition-colors outline-none hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="sr-only">Remove filter:</span>
                {filter.label}
                <X
                  className="size-3 text-muted-foreground group-hover:text-foreground"
                  aria-hidden
                />
              </button>
            ) : null,
          )}
          {onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="ml-1 text-xs underline underline-offset-4 outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      {children}
    </div>
  );
}
