"use client";

import Link from "next/link";
import { ArrowUpRight, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { initials } from "@/lib/format.ts";

export interface SwitcherStore {
  slug: string;
  displayName: string;
  roleLabel: string;
}

/**
 * Store picker. The list of stores comes from the session's memberships, handed
 * down as props from the server shell; this component only owns the open/close
 * interaction, so no data fetch lives in the browser.
 */
export function StoreSwitcher({
  stores,
  currentSlug,
  currentName,
  currentRole,
}: {
  stores: SwitcherStore[];
  currentSlug: string;
  currentName: string;
  currentRole: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group/store-switch flex w-full min-w-0 items-center gap-2 rounded-lg border border-sidebar-border px-2 py-1.5 text-left text-sm transition-colors duration-150 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground transition-transform duration-200 ease-out group-hover/store-switch:scale-105 motion-reduce:transition-none motion-reduce:group-hover/store-switch:scale-100"
        >
          {initials(currentName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{currentName}</span>
          <span className="truncate text-xs text-muted-foreground">{currentRole}</span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover/store-switch:translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/store-switch:translate-y-0"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Trocar de loja</DropdownMenuLabel>
          {stores.map((store) => {
            const active = store.slug === currentSlug;

            return (
              <DropdownMenuItem
                key={store.slug}
                // The active store stays in the list as a disabled, checked
                // entry so the trail of visited stores is readable.
                disabled={active}
                nativeButton={false}
                render={
                  <Link
                    href={`/dashboard/${store.slug}`}
                    aria-label={`Abrir painel de ${store.displayName}`}
                  />
                }
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[0.65rem] font-semibold text-muted-foreground"
                >
                  {initials(store.displayName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{store.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{store.roleLabel}</span>
                </span>
                {active ? <Check aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
