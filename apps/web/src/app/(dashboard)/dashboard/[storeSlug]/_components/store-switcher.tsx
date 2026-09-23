"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { MOCK_STORES } from "@/lib/mock-dashboard-data.ts";

export function StoreSwitcher({ currentSlug }: { currentSlug: string }) {
  const current = MOCK_STORES.find((store) => store.slug === currentSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-sidebar-border px-2.5 py-1.5 text-sm font-medium transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50">
        <Store aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{current?.displayName ?? "Loja"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
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
                <Store aria-hidden="true" />
                <span className="flex-1">{store.displayName}</span>
                {active ? <Check aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
