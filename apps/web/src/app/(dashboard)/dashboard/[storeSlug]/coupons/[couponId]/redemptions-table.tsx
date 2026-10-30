"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { PanelCouponRedemption } from "@menuza/shared/tenant";
import Link from "next/link";
import { useTransition } from "react";
import { Search, X } from "lucide-react";
import { debounce, useQueryStates } from "nuqs";
import { Button } from "@/components/ui/button.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { formatBrl, formatDateTime, formatInteger } from "@/lib/format.ts";
import { couponRedemptionSearchParams, REDEMPTION_PAGE_SIZE } from "../coupon-search-params.ts";

export function RedemptionsTable({
  storeSlug,
  redemptions,
  totalRedemptions,
}: {
  storeSlug: string;
  redemptions: PanelCouponRedemption[];
  totalRedemptions: number;
}) {
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useQueryStates(couponRedemptionSearchParams, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const { q, sort, page } = filters;

  const pageCount = Math.max(1, Math.ceil(totalRedemptions / REDEMPTION_PAGE_SIZE));

  const columns: ColumnDef<typeof dashboardTableFeatures, PanelCouponRedemption, unknown>[] = [
    {
      id: "customer",
      header: "Cliente",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <Link
            href={`/dashboard/${storeSlug}/customers/${row.original.customer.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.customer.name}
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {row.original.customer.email}
          </span>
        </div>
      ),
    },
    {
      id: "order",
      header: "Pedido",
      cell: ({ row }) => (
        <Link
          href={`/dashboard/${storeSlug}/orders/${row.original.order.code}`}
          className="font-mono text-sm underline-offset-4 hover:underline"
        >
          {row.original.order.code}
        </Link>
      ),
    },
    {
      accessorKey: "discountCents",
      meta: { width: 140 },
      header: "Desconto",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatBrl(row.original.discountCents)}</span>
      ),
    },
    {
      id: "orderTotalCents",
      meta: { width: 140 },
      header: "Total do pedido",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatBrl(row.original.order.totalCents)}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      meta: { width: 180 },
      header: "Usado em",
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
        <InputGroup className="max-w-sm min-w-[16rem] flex-1">
          <InputGroupAddon align="inline-start">
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(event) => {
              const next = event.target.value;

              void setFilters(
                { q: next, page: null },
                { limitUrlUpdates: next === "" ? undefined : debounce(300) },
              );
            }}
            placeholder="Buscar por cliente, e-mail ou pedido…"
            aria-label="Buscar resgates"
          />
          {isPending ? (
            <InputGroupAddon align="inline-end">
              <Spinner aria-label="Carregando resgates" />
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        <ToggleGroup
          variant="outline"
          aria-label="Ordenar resgates"
          value={[sort]}
          onValueChange={(next) => {
            const selected = next[0];

            if (selected === "recent" || selected === "oldest" || selected === "discount")
              void setFilters({ sort: selected, page: null });
          }}
        >
          <ToggleGroupItem value="recent">Recentes</ToggleGroupItem>
          <ToggleGroupItem value="oldest">Antigos</ToggleGroupItem>
          <ToggleGroupItem value="discount">Maior desconto</ToggleGroupItem>
        </ToggleGroup>

        {q.trim() === "" ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void setFilters({ q: null, page: null })}
          >
            <X data-icon="inline-start" aria-hidden="true" />
            Limpar busca
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {formatInteger(redemptions.length)} de {formatInteger(totalRedemptions)} resgates
        {pageCount > 1 ? ` · página ${formatInteger(page)} de ${formatInteger(pageCount)}` : ""}
      </p>

      <DataTable
        key={JSON.stringify([q, sort, page])}
        columns={columns}
        data={redemptions}
        hideToolbar
        pageSize={REDEMPTION_PAGE_SIZE}
        tableLabel="Resgates do cupom"
        exportFilename={`resgates-cupom-${storeSlug}`}
        exportColumns={[
          { key: "customer", label: "Cliente", accessor: (r) => r.customer.name },
          { key: "email", label: "E-mail", accessor: (r) => r.customer.email },
          { key: "order", label: "Pedido", accessor: (r) => r.order.code },
          {
            key: "discountCents",
            label: "Desconto",
            accessor: (r) => (r.discountCents / 100).toFixed(2),
          },
          {
            key: "orderTotalCents",
            label: "Total do pedido",
            accessor: (r) => (r.order.totalCents / 100).toFixed(2),
          },
          { key: "createdAt", label: "Usado em", accessor: (r) => r.createdAt },
        ]}
      />

      {pageCount > 1 ? (
        <nav aria-label="Paginação dos resgates" className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => void setFilters({ page: page - 1 })}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount || isPending}
            onClick={() => void setFilters({ page: page + 1 })}
          >
            Próxima
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
