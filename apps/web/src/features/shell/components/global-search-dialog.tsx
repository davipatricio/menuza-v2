/**
 * Quick-nav palette: filters the dashboard's live pages by name and jumps on
 * Enter or click. Client-side only — no API call, see `global-search.tsx`.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { Input } from "@/components/ui/input.tsx";
import { GlobalSearchRow } from "./global-search-row.tsx";
import {
  clampIndex,
  moveIndex,
  searchPages,
  type MoveKey,
  type PageSearchItem,
} from "../lib/search-utils.ts";

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

const MOVE_KEYS = new Set<string>(["ArrowDown", "ArrowUp", "Home", "End"]);

export function GlobalSearchDialog({
  open,
  onOpenChange,
  pages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: PageSearchItem[];
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const results = useMemo(() => searchPages(pages, query), [pages, query]);
  const activeIndex = clampIndex(results.length, cursor);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setCursor(0);
    }

    onOpenChange(next);
  }

  function select(item: PageSearchItem) {
    handleOpenChange(false);
    // `href` is resolved at runtime from `NAV_GROUPS`, which the typed router
    // cannot narrow, so a document navigation keeps this route-agnostic.
    window.location.assign(item.href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      handleOpenChange(false);

      return;
    }

    if (event.key === "Enter") {
      const item = results[activeIndex];

      if (!item) return;

      event.preventDefault();
      select(item);

      return;
    }

    if (MOVE_KEYS.has(event.key)) {
      event.preventDefault();
      // SAFETY: MOVE_KEYS only contains `MoveKey` members.
      setCursor(moveIndex(results.length, activeIndex, event.key as MoveKey));
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="dialog-overlay"
          className="fixed inset-0 z-40 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs"
        />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className="fixed top-[12vh] left-1/2 z-40 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col gap-2 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg transition duration-150 outline-none data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          <DialogTitle className="sr-only">Busca rápida</DialogTitle>
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar no painel"
            aria-label="Buscar no painel"
            aria-controls="global-search-results"
            aria-activedescendant={
              activeIndex >= 0 ? `global-search-option-${results.at(activeIndex)?.id}` : undefined
            }
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
          />
          {results.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>
          ) : (
            <div
              id="global-search-results"
              role="listbox"
              aria-label="Páginas do painel"
              className="flex min-h-0 flex-col gap-0.5 overflow-y-auto"
            >
              {results.map((item, index) => (
                <GlobalSearchRow
                  key={item.id}
                  item={item}
                  active={index === activeIndex}
                  onSelect={() => select(item)}
                />
              ))}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
