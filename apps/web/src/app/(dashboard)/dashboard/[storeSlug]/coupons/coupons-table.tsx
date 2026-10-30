"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { PanelCouponSummary } from "@menuza/shared/tenant";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { tenantContractObject } from "@menuza/shared/tenant";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Search, X } from "lucide-react";
import { debounce, useQueryStates } from "nuqs";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { formatBrl, formatDateTime, formatInteger } from "@/lib/format.ts";
import {
  COUPON_STATUS_LABELS,
  COUPON_STATUS_VARIANTS,
  DISCOUNT_TYPE_LABELS,
} from "@/lib/panel-labels.ts";
import { couponSearchParams } from "./coupon-search-params.ts";
import { useCouponWebMcp } from "./coupons-webmcp.ts";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

/** One scale for screen and CSV: percent coupons read as "15%", fixed ones as BRL. */
function formatDiscount(coupon: PanelCouponSummary): string {
  const base =
    coupon.valuePercent !== null ? `${coupon.valuePercent}%` : formatBrl(coupon.valueCents ?? 0);

  // The freight discount rides along with the order discount, so the cell and
  // the CSV both show it instead of leaving it invisible after save.
  return coupon.shippingDiscountPercent === null
    ? base
    : `${base} + frete ${coupon.shippingDiscountPercent}%`;
}

/** `usageLimit` is the cap; `usageCount` is the counter the checkout keeps. */
function usageLabel(coupon: PanelCouponSummary): string {
  return coupon.usageLimit === null
    ? formatInteger(coupon.redemptionCount)
    : `${formatInteger(coupon.redemptionCount)} / ${formatInteger(coupon.usageLimit)}`;
}

function deleteMessage(error: Error): string {
  if (error instanceof ORPCError) {
    if (error.code === "FORBIDDEN") return "Você não tem permissão para excluir cupons nesta loja.";

    if (error.code === "NOT_FOUND") return "Este cupom não existe mais. Atualize a lista.";
  }

  return error.message || "Não foi possível excluir o cupom.";
}

export function CouponsTable({
  coupons,
  storeCoupons,
  storeSlug,
  totalCount,
}: {
  /** Rows after the URL filter — what the table renders. */
  coupons: PanelCouponSummary[];
  /** Every coupon in the store — what the WebMCP tools answer from, so a
   * filter on screen never narrows what an agent is told the store holds. */
  storeCoupons: PanelCouponSummary[];
  storeSlug: string;
  totalCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<PanelCouponSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [filters, setFilters] = useQueryStates(couponSearchParams, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const { q, status, sort, order } = filters;

  useCouponWebMcp(storeCoupons);

  const deleteMutation = useMutation({
    mutationFn: (couponId: string) => client().panel.deleteCoupon({ storeSlug, couponId }),
    onSuccess: ({ archived }) => {
      setFailure(null);
      setNotice(
        archived
          ? "O cupom já tinha resgates, então foi desativado em vez de excluído. O histórico de uso foi mantido."
          : "Cupom excluído.",
      );
      setConfirming(null);
      router.refresh();
    },
    onError: (error) => {
      // The dialog is modal, so an error left behind it is invisible. Close it
      // first and let the Alert on the page carry the message.
      setConfirming(null);
      setFailure(deleteMessage(error));
    },
  });

  const activeFilters = q.trim() !== "" || status !== "all";

  const clearFilters = () => {
    void setFilters({ q: null, status: null });
  };

  const serverSort = {
    sort,
    order,
    columns: {
      code: "code",
      redemptionCount: "redemptions",
      discountCents: "discount",
      lastRedeemedAt: "lastRedeemed",
      endsAt: "endDate",
    },
    onSort: (key: string) => {
      // SAFETY: DataTable only calls this with keys declared in `columns`.
      const sortKey = key as typeof sort;

      void setFilters({
        sort: sortKey,
        order: sort === sortKey && order === "asc" ? "desc" : "asc",
      });
    },
  };

  const columns: ColumnDef<typeof dashboardTableFeatures, PanelCouponSummary, unknown>[] = [
    {
      accessorKey: "code",
      header: "Cupom",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <Link
            href={`/dashboard/${storeSlug}/coupons/${row.original.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.code}
          </Link>
          {row.original.description === null ? null : (
            <span className="max-w-64 truncate text-xs text-muted-foreground">
              {row.original.description}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "discountType",
      header: "Desconto",
      cell: ({ row }) => <span className="tabular-nums">{formatDiscount(row.original)}</span>,
    },
    {
      id: "redemptionCount",
      meta: { width: 120 },
      header: "Resgates",
      cell: ({ row }) => <span className="tabular-nums">{usageLabel(row.original)}</span>,
    },
    {
      id: "discountCents",
      meta: { width: 140 },
      header: "Concedido",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatBrl(row.original.discountCents)}</span>
      ),
    },
    {
      id: "uniqueCustomers",
      meta: { width: 110 },
      header: "Clientes",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatInteger(row.original.uniqueCustomers)}</span>
      ),
    },
    {
      id: "lastRedeemedAt",
      meta: { width: 160 },
      header: "Último uso",
      cell: ({ row }) =>
        row.original.lastRedeemedAt === null ? (
          <span className="text-muted-foreground">Nunca usado</span>
        ) : (
          <span className="whitespace-nowrap tabular-nums">
            {formatDateTime(row.original.lastRedeemedAt)}
          </span>
        ),
    },
    {
      accessorKey: "effectiveStatus",
      meta: { width: 120 },
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={COUPON_STATUS_VARIANTS[row.original.effectiveStatus]}>
          {COUPON_STATUS_LABELS[row.original.effectiveStatus]}
        </Badge>
      ),
    },
    {
      id: "actions",
      meta: { width: 90 },
      header: () => <span className="sr-only">Ações</span>,
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={deleteMutation.isPending && confirming?.id === row.original.id}
          onClick={(event) => {
            event.stopPropagation();
            setFailure(null);
            setConfirming(row.original);
          }}
        >
          Excluir
        </Button>
      ),
    },
  ];

  const exportColumns = [
    { key: "code", label: "Código" },
    {
      key: "description",
      label: "Descrição",
      accessor: (c: PanelCouponSummary) => c.description ?? "",
    },
    {
      key: "discountType",
      label: "Tipo",
      accessor: (c: PanelCouponSummary) => DISCOUNT_TYPE_LABELS[c.discountType],
    },
    { key: "discount", label: "Desconto", accessor: formatDiscount },
    {
      key: "redemptions",
      label: "Resgates",
      accessor: (c: PanelCouponSummary) => c.redemptionCount,
    },
    {
      key: "discountCents",
      label: "Desconto concedido",
      accessor: (c: PanelCouponSummary) => (c.discountCents / 100).toFixed(2),
    },
    {
      key: "uniqueCustomers",
      label: "Clientes únicos",
      accessor: (c: PanelCouponSummary) => c.uniqueCustomers,
    },
    {
      key: "lastRedeemedAt",
      label: "Último uso",
      accessor: (c: PanelCouponSummary) => c.lastRedeemedAt ?? "",
    },
    {
      key: "status",
      label: "Status",
      accessor: (c: PanelCouponSummary) => COUPON_STATUS_LABELS[c.effectiveStatus],
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
                { q: next },
                { limitUrlUpdates: next === "" ? undefined : debounce(300) },
              );
            }}
            placeholder="Buscar por código ou descrição…"
            aria-label="Buscar cupons"
          />
          {isPending ? (
            <InputGroupAddon align="inline-end">
              <Spinner aria-label="Carregando cupons" />
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        <ToggleGroup
          variant="outline"
          aria-label="Status do cupom"
          value={[status]}
          onValueChange={(next) => {
            const selected = next[0];

            if (
              selected === "all" ||
              selected === "active" ||
              selected === "expired" ||
              selected === "disabled"
            )
              void setFilters({ status: selected });
          }}
        >
          <ToggleGroupItem value="all">Todos</ToggleGroupItem>
          <ToggleGroupItem value="active">Ativos</ToggleGroupItem>
          <ToggleGroupItem value="expired">Expirados</ToggleGroupItem>
          <ToggleGroupItem value="disabled">Desativados</ToggleGroupItem>
        </ToggleGroup>

        {activeFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            <X data-icon="inline-start" aria-hidden="true" />
            Limpar filtros
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {coupons.length} de {totalCount} cupons
      </p>

      {notice ? (
        <Alert>
          <AlertTitle>Alteração aplicada</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Não foi possível excluir o cupom</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        key={JSON.stringify([q, status, sort, order])}
        columns={columns}
        data={coupons}
        hideToolbar
        serverSort={serverSort}
        tableLabel="Cupons"
        rowHref={(coupon) => `/dashboard/${storeSlug}/coupons/${coupon.id}`}
        exportFilename={`cupons-${storeSlug}`}
        exportColumns={exportColumns}
      />

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Excluir o cupom "${confirming?.code}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming !== null && confirming.redemptionCount > 0
                ? `Este cupom já foi usado ${formatInteger(confirming.redemptionCount)} ${confirming.redemptionCount === 1 ? "vez" : "vezes"}. Ele será desativado, não excluído, para o desconto concedido continuar aparecendo nos pedidos.`
                : "O cupom nunca foi usado, então será removido permanentemente. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!confirming) return;

                deleteMutation.mutate(confirming.id);
              }}
            >
              {deleteMutation.isPending
                ? "Processando…"
                : confirming !== null && confirming.redemptionCount > 0
                  ? "Desativar cupom"
                  : "Excluir cupom"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
