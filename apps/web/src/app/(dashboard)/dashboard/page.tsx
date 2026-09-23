import Link from "next/link";
import { ArrowUpRight, Store } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import { MOCK_STORES, getStoreCustomers, getStoreOrders } from "@/lib/mock-dashboard-data.ts";

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
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Store aria-hidden="true" className="size-4 text-muted-foreground" />
          Menuza
        </span>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Suas lojas</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Escolha uma loja para abrir o painel de gestão.
          </p>
        </div>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {MOCK_STORES.map((store) => (
            <li key={store.slug}>
              <Link
                href={`/dashboard/${store.slug}`}
                aria-label={`Abrir painel de ${store.displayName}`}
                className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="h-full shadow-surface transition-shadow duration-150 ease-out hover:shadow-surface-hover">
                  <CardHeader>
                    <CardTitle className="text-base">{store.displayName}</CardTitle>
                    <CardDescription className="tabular-nums">
                      {storeSummary(store.slug)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      Abrir painel
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
