"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, SearchX } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

import { GlobalSearchRow, GlobalSearchRowActions } from "./global-search-row.tsx";
import type { GlobalSearchState } from "./use-global-search.ts";
import {
  GROUP_LABELS,
  clampIndex,
  flattenGroups,
  moveIndex,
  type MoveKey,
  type SearchItem,
} from "./global-search-utils.ts";

const LISTBOX_ID = "global-search-listbox";

const OPTION_ID_PREFIX = "global-search-option-";

const KBD_CLASSES =
  "rounded-sm border border-border bg-muted px-1 font-sans text-xs text-muted-foreground";

const SEE_ALL_CLASSES =
  "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

/** Only these kinds have a filtered list that reads `?q=`. */
const SEE_ALL_PATHS: Partial<Record<SearchItem["kind"], string>> = {
  product: "/catalog/products",
  coupon: "/coupons",
  department: "/catalog/departments",
  category: "/catalog/categories",
  subcategory: "/catalog/subcategories",
};

/** The server caps every group at 5, so a full group is the only signal that more exist. */
const SEE_ALL_FULL_GROUP = 5;

const SEE_ALL_MIN_QUERY = 2;

function isMoveKey(key: string): key is MoveKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

function announce(count: number): string {
  if (count === 0) return "Nenhum resultado";

  return count === 1 ? "1 resultado" : `${count} resultados`;
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
  storeSlug,
  search,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeSlug: string;
  search: GlobalSearchState;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { query, setQuery, groups, canWrite, loading, error, retry } = search;

  const flat = useMemo(() => flattenGroups(groups), [groups]);
  const listKey = `${query}|${flat.length}`;

  /** The cursor remembers the list it belongs to, so a new list starts at the top. */
  const [cursor, setCursor] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const activeIndex = clampIndex(flat.length, cursor.key === listKey ? cursor.index : 0);
  const activeItem = activeIndex >= 0 ? flat[activeIndex] : undefined;
  const activeId = activeItem ? `${OPTION_ID_PREFIX}${activeIndex}` : undefined;

  const flatIndex = useMemo(
    () => new Map(flat.map((item, index) => [`${item.kind}:${item.id}`, index])),
    [flat],
  );

  const navigate = (href: string) => {
    router.push(href);
    onOpenChange(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      if (!activeItem) return;

      event.preventDefault();
      navigate(activeItem.href);

      return;
    }

    if (!isMoveKey(event.key)) return;

    event.preventDefault();
    setCursor({ key: listKey, index: moveIndex(flat.length, activeIndex, event.key) });
  };

  const basePath = `/dashboard/${storeSlug}`;
  const trimmed = query.trim();

  const seeAll = groups.flatMap((group) => {
    const path = SEE_ALL_PATHS[group.kind];
    const full = group.items.length === SEE_ALL_FULL_GROUP;

    if (!path || !full || trimmed.length < SEE_ALL_MIN_QUERY) return [];

    return [{ kind: group.kind, href: `${basePath}${path}?q=${encodeURIComponent(trimmed)}` }];
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={inputRef}
        className="w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Buscar no painel</DialogTitle>

        <div className="border-b p-2">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <Search aria-hidden="true" />
            </InputGroupAddon>

            <InputGroupInput
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar páginas, produtos, cupons…"
              aria-label="Buscar no painel"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={flat.length > 0 ? LISTBOX_ID : undefined}
              aria-activedescendant={activeId}
            />

            {loading ? (
              <InputGroupAddon align="inline-end">
                <Spinner />
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </div>

        {error ? (
          <div className="px-2 py-2">
            <Alert variant="destructive">
              <AlertTitle>Não foi possível buscar</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                {error}
                <Button type="button" variant="outline" size="xs" onClick={retry}>
                  Tentar de novo
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <p aria-live="polite" className="sr-only">
          {announce(flat.length)}
        </p>

        <ScrollArea className="max-h-[min(60vh,420px)]">
          {flat.length === 0 ? (
            <Empty className="border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Nenhum resultado</EmptyTitle>
                <EmptyDescription>Nada corresponde a “{trimmed}”.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div id={LISTBOX_ID} role="listbox" aria-label="Resultados da busca" className="p-1">
              {groups.map((group) => (
                <div key={group.kind} role="presentation">
                  <p role="presentation" className="px-2 py-1.5 text-xs text-muted-foreground">
                    {GROUP_LABELS[group.kind]}
                  </p>

                  <div role="presentation" className="grid gap-0.5">
                    {group.items.map((item) => {
                      const index = flatIndex.get(`${item.kind}:${item.id}`) ?? -1;

                      return (
                        <GlobalSearchRow
                          key={`${item.kind}:${item.id}`}
                          id={`${OPTION_ID_PREFIX}${index}`}
                          item={item}
                          active={index === activeIndex}
                          onSelect={() => navigate(item.href)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {activeItem && activeItem.kind !== "page" ? (
          <GlobalSearchRowActions
            key={`${activeItem.kind}:${activeItem.id}`}
            item={activeItem}
            storeSlug={storeSlug}
            canWrite={canWrite}
            onNavigate={() => navigate(activeItem.href)}
          />
        ) : null}

        {seeAll.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-xs">
            {seeAll.map((link) => (
              <Link
                key={link.kind}
                href={link.href}
                className={SEE_ALL_CLASSES}
                onClick={() => onOpenChange(false)}
              >
                {`Ver todos: ${GROUP_LABELS[link.kind]}`}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="hidden items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1">
            <kbd className={KBD_CLASSES}>↑↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className={KBD_CLASSES}>Enter</kbd> abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className={KBD_CLASSES}>Esc</kbd> fechar
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
