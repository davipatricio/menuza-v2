/**
 * Header quick-nav trigger: opens the palette with a click or Ctrl/⌘+K.
 *
 * API-backed entity search returns with the catalog routes (S29+); until then
 * this palette only jumps to live dashboard pages — every `NAV_GROUPS` item
 * with a `to`.
 */
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { GlobalSearchDialog } from "./global-search-dialog.tsx";
import { NAV_GROUPS } from "./nav-config.ts";
import type { PageSearchItem } from "../lib/search-utils.ts";

export function GlobalSearch({ storeSlug }: { storeSlug: string }) {
  const [open, setOpen] = useState(false);

  const pages = useMemo<PageSearchItem[]>(
    () =>
      NAV_GROUPS.flatMap((group) =>
        group.items.flatMap((item) =>
          item.to
            ? [
                {
                  kind: "page" as const,
                  id: item.key,
                  label: item.label,
                  href: item.to.replace("$storeSlug", storeSlug),
                  section: group.label,
                },
              ]
            : [],
        ),
      ),
    [storeSlug],
  );

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;

      event.preventDefault();
      setOpen((current) => !current);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="min-w-0 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search aria-hidden="true" />
        <span className="truncate">Buscar no painel</span>
        <kbd className="ml-2 hidden rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </Button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} pages={pages} />
    </>
  );
}
