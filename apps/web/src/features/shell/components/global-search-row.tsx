/**
 * One result row in the quick-nav palette. Rendered as a listbox option but not
 * tabbable: the input keeps focus and drives the active row with the arrow keys.
 */
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { cn } from "cn";
import type { PageSearchItem } from "../lib/search-utils.ts";

export function GlobalSearchRow({
  item,
  active,
  onSelect,
}: {
  item: PageSearchItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-active={active}
      tabIndex={-1}
      id={`global-search-option-${item.id}`}
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-foreground transition-colors outline-none",
        "data-[active=true]:bg-muted",
      )}
    >
      <LayoutDashboard aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{item.label}</span>
        {item.section ? (
          <span className="truncate text-xs text-muted-foreground">{item.section}</span>
        ) : null}
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
