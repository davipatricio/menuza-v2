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
import { MOCK_STORES } from "@/lib/mock-dashboard-data.ts";

export function StoreSwitcher({ currentSlug }: { currentSlug: string }) {
  const current = MOCK_STORES.find((store) => store.slug === currentSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group/store-switch flex w-full min-w-0 items-center gap-2 rounded-lg border border-sidebar-border px-2 py-1.5 text-left text-sm transition-colors duration-150 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground transition-transform duration-200 ease-out group-hover/store-switch:scale-105 motion-reduce:transition-none motion-reduce:group-hover/store-switch:scale-100"
        >
          {initials(current?.displayName ?? "Loja")}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{current?.displayName ?? "Loja"}</span>
          <span className="truncate text-xs text-muted-foreground">
            {current?.role ?? "Sem papel definido"}
          </span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover/store-switch:translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/store-switch:translate-y-0"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Trocar de loja</DropdownMenuLabel>
          {MOCK_STORES.map((store) => {
            const active = store.slug === currentSlug;

            return (
              <DropdownMenuItem
                key={store.slug}
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
                  <span className="truncate text-xs text-muted-foreground">{store.role}</span>
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
