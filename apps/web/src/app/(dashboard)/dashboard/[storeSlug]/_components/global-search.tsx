"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";

import { GlobalSearchDialog } from "./global-search-dialog.tsx";
import { useGlobalSearch } from "./use-global-search.ts";

const SERVER_SHORTCUT = "Ctrl K";

/** The shortcut glyph depends on the platform, which never changes at runtime. */
function subscribeToNothing(): () => void {
  return () => {};
}

function shortcutOnPlatform(): string {
  return /mac|iphone|ipad/i.test(navigator.userAgent) ? "⌘K" : SERVER_SHORTCUT;
}

function shortcutOnServer(): string {
  return SERVER_SHORTCUT;
}

export function GlobalSearch({ storeSlug }: { storeSlug: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const search = useGlobalSearch({ storeSlug });
  const { setQuery } = search;
  const shortcut = useSyncExternalStore(subscribeToNothing, shortcutOnPlatform, shortcutOnServer);

  /** One close path: drop the query, then hand focus back to the trigger. */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setQuery("");

      setOpen(next);

      if (!next) requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [setQuery],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key.toLowerCase() !== "k") return;

      event.preventDefault();
      handleOpenChange(!open);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenChange, open]);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        className="text-muted-foreground"
        aria-label="Buscar no painel"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => handleOpenChange(true)}
      >
        <Search aria-hidden="true" data-icon="inline-start" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="hidden items-center rounded-sm border border-border bg-muted px-1 font-sans text-xs md:inline-flex">
          {shortcut}
        </kbd>
      </Button>

      <GlobalSearchDialog
        open={open}
        onOpenChange={handleOpenChange}
        storeSlug={storeSlug}
        search={search}
      />
    </>
  );
}
