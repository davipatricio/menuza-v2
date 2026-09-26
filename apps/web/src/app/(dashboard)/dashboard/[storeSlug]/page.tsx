import { ViewTransition } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  Banknote,
  BookOpen,
  Receipt,
  Settings,
  ShoppingCart,
  Ticket,
} from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { panelClient } from "@/lib/server-tenant.ts";
import { EmptyState } from "./_components/empty-state.tsx";
import { OverviewTable } from "./_components/overview-table.tsx";
import { OverviewNav } from "./_components/overview-nav.tsx";

// The overview reads the store's orders on every request, like the shell.
export const instant = false;

const KPI_CARDS = [
  { title: "Vendas hoje", hint: "Coleta de vendas ainda não definida.", icon: Banknote },
  { title: "Ticket médio", hint: "Coleta de ticket médio ainda não definida.", icon: Receipt },
  { title: "Pedidos ativos", hint: "Coleta de pedidos ainda não definida.", icon: ShoppingCart },
  { title: "Cupons ativos", hint: "Coleta de cupons ainda não definida.", icon: Ticket },
];

const QUICK_ACTIONS = [
  { href: "orders", label: "Ver pedidos", icon: ShoppingCart },
  { href: "catalog", label: "Ver catálogo", icon: BookOpen },
  { href: "settings/store", label: "Configurações da loja", icon: Settings },
];

export default async function StoreOverviewPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { orders } = await client.panel.listOrders({ storeSlug });
  const basePath = `/dashboard/${storeSlug}`;
  const recentOrders = orders.slice(0, 5);

  return (
    <ViewTransition enter={{ "store-enter": "store-enter", default: "none" }}>
      <section aria-labelledby="overview-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 id="overview-heading" className="text-xl font-semibold tracking-tight">
            Visão geral
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">Movimento da loja.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_CARDS.map((kpi) => (
            <Card key={kpi.title}>
              <CardHeader className="grid-cols-[1fr_auto] items-center">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.title}
                </CardTitle>
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                  <kpi.icon className="size-3.5" />
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Badge variant="outline" className="text-muted-foreground">
                  Aguardando coleta
                </Badge>
                <p className="text-xs text-pretty text-muted-foreground">{kpi.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Pedidos recentes</h3>
              {recentOrders.length ? (
                <Link
                  href={`${basePath}/orders`}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Ver todos
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </Link>
              ) : null}
            </div>
            {recentOrders.length ? (
              <OverviewTable orders={recentOrders} basePath={basePath} storeSlug={storeSlug} />
            ) : (
              <EmptyState>Nenhum pedido ainda. Os pedidos da loja aparecem aqui.</EmptyState>
            )}
          </div>

          <OverviewNav basePath={basePath} actions={QUICK_ACTIONS} />
        </div>
      </section>
    </ViewTransition>
  );
}
