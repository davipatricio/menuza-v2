import { ViewTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Store } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import { initials } from "@/lib/format.ts";
import {
  MOCK_CURRENT_USER,
  MOCK_STORES,
  getStoreCustomers,
  getStoreOrders,
} from "@/lib/mock-dashboard-data.ts";
import { NewStoreCard } from "./_components/new-store-card.tsx";

function storeSummary(slug: string): string {
  const orders = getStoreOrders(slug).length;
  const customers = getStoreCustomers(slug).length;

  if (orders === 0 && customers === 0) return "Nenhum dado ainda";

  return `${orders} ${orders === 1 ? "pedido" : "pedidos"} · ${customers} ${
    customers === 1 ? "cliente" : "clientes"
  }`;
}

export default function DashboardPickerPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Store className="size-3.5" />
          </span>
          Menuza
        </span>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 sm:flex">
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-full bg-muted text-[0.65rem] font-semibold text-muted-foreground"
            >
              {initials(MOCK_CURRENT_USER.name)}
            </span>
            <span className="text-sm font-medium">{MOCK_CURRENT_USER.name}</span>
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6 md:py-16">
        <ViewTransition exit="store-enter">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Suas lojas</h1>
            <p className="text-sm text-pretty text-muted-foreground">
              Escolha uma loja para abrir o painel de gestão.
            </p>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {MOCK_STORES.map((store) => (
              <li key={store.slug}>
                <Link
                  href={`/dashboard/${store.slug}`}
                  aria-label={`Abrir painel de ${store.displayName}`}
                  transitionTypes={["store-enter"]}
                  className="group/store block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-sm text-card-foreground shadow-surface transition-[transform,box-shadow] duration-200 ease-out group-hover/store:-translate-y-0.5 group-hover/store:shadow-surface-hover group-focus-visible/store:shadow-surface-hover motion-reduce:transition-none motion-reduce:group-hover/store:translate-y-0">
                    <div
                      aria-hidden="true"
                      className="flex h-20 items-center justify-center border-b border-border bg-muted/40 transition-colors duration-200 group-hover/store:bg-muted/70 motion-reduce:transition-none"
                    >
                      <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-transform duration-200 ease-out group-hover/store:scale-105 motion-reduce:transition-none motion-reduce:group-hover/store:scale-100">
                        {initials(store.displayName)}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      <h2 className="text-base leading-snug font-medium">{store.displayName}</h2>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium">
                          {store.role}
                        </span>
                        <span className="tabular-nums">{storeSummary(store.slug)}</span>
                      </p>
                    </div>
                    <div className="flex items-center justify-between px-4 pb-4">
                      <span className="text-sm font-medium text-muted-foreground">
                        Abrir painel
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-4 text-muted-foreground transition-transform duration-200 ease-out group-hover/store:translate-x-0.5 group-hover/store:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/store:translate-0"
                      />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <NewStoreCard />
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Estas são as lojas vinculadas a {MOCK_CURRENT_USER.name}. O papel exibido é
            demonstrativo.
          </p>
        </ViewTransition>
      </main>
    </div>
  );
}
