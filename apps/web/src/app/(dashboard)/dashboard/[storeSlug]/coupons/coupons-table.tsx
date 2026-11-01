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
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Search, Trash2, X } from "lucide-react";
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
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { formatBrl, formatDateTime, formatInteger } from "@/lib/format.ts";
import { COUPON_STATUS_LABELS, DISCOUNT_TYPE_LABELS } from "@/lib/panel-labels.ts";
import { couponSearchParams } from "./coupon-search-params.ts";
import { useCouponWebMcp } from "./coupons-webmcp.ts";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

/** The switch writes the stored status; `expired` is derived on read. */
type CouponWriteStatus = "active" | "disabled";

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

    if (error.code === "NOT_FOUND") return "Um ou mais cupons não existem mais. Atualize a lista.";
  }

  return error.message || "Não foi possível excluir os cupons.";
}

function statusMessage(error: Error): string {
  if (error instanceof ORPCError) {
    if (error.code === "FORBIDDEN") return "Você não tem permissão para alterar cupons nesta loja.";

    if (error.code === "NOT_FOUND") return "Este cupom não existe mais. Atualize a lista.";

    // Activating a coupon whose window already closed is refused by the server.
    if (error.code === "VALIDATION_FAILED") return error.message;
  }

  return error.message || "Não foi possível alterar o status do cupom.";
}

/** Reports both bulk outcomes: archived rows keep their usage history. */
function bulkDeleteNotice(deleted: number, archived: number): string {
  const removed = `${deleted} ${deleted === 1 ? "cupom excluído" : "cupons excluídos"}`;

  const kept = `${archived} ${
    archived === 1
      ? "cupom desativado por ter histórico de uso"
      : "cupons desativados por terem histórico de uso"
  }`;

  if (deleted === 0) return `${kept}.`;

  if (archived === 0) return `${removed}.`;

  return `${removed} e ${kept}.`;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, CouponWriteStatus>>({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const [filters, setFilters] = useQueryStates(couponSearchParams, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const { q, status, sort, order } = filters;

  useCouponWebMcp(storeCoupons);

  const couponIds = useMemo(() => new Set(coupons.map((coupon) => coupon.id)), [coupons]);

  // Selection lives outside `DataTable`, which remounts on every filter change,
  // and is pruned to the rows on screen so a hidden row never leaves the action set.
  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => couponIds.has(id)),
    [selectedIds, couponIds],
  );

  const selectedSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);

  const allSelected = coupons.length > 0 && coupons.every((coupon) => selectedSet.has(coupon.id));

  const someSelected = activeSelectedIds.length > 0;

  const statusMutation = useMutation({
    mutationFn: ({ couponId, status }: { couponId: string; status: CouponWriteStatus }) =>
      client().panel.setCouponStatus({ storeSlug, couponId, status }),
    onMutate: ({ couponId, status }) => {
      setStatusOverrides((current) => ({ ...current, [couponId]: status }));
    },
    onSuccess: () => {
      setFailure(null);
      router.refresh();
    },
    onError: (error, { couponId }) => {
      setStatusOverrides((current) => {
        const next = { ...current };
        delete next[couponId];

        return next;
      });
      setFailure(statusMessage(error));
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => client().panel.bulkDeleteCoupons({ storeSlug, couponIds: activeSelectedIds }),
    onSuccess: ({ deleted, archived }) => {
      setFailure(null);
      setNotice(bulkDeleteNotice(deleted, archived));
      setBulkDeleteOpen(false);
      setSelectedIds([]);
      router.refresh();
    },
    onError: (error) => {
      // The dialog is modal, so an error left behind it is invisible. Close it
      // first and let the Alert on the page carry the message.
      setBulkDeleteOpen(false);
      setFailure(deleteMessage(error));
    },
  });

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : coupons.map((coupon) => coupon.id));
  };

  const statusSwitch = (coupon: PanelCouponSummary) => {
    const effectiveStatus = statusOverrides[coupon.id] ?? coupon.effectiveStatus;

    const checked = effectiveStatus === "active";

    const pending = statusMutation.isPending && statusMutation.variables?.couponId === coupon.id;

    return (
      <Switch
        size="sm"
        checked={checked}
        disabled={pending || effectiveStatus === "expired"}
        onCheckedChange={(next) =>
          statusMutation.mutate({ couponId: coupon.id, status: next ? "active" : "disabled" })
        }
        aria-label={checked ? `Desativar o cupom ${coupon.code}` : `Ativar o cupom ${coupon.code}`}
      />
    );
  };

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
      id: "select",
      meta: { width: 32 },
      enableSorting: false,
      header: () => (
        <Checkbox
          aria-label={allSelected ? "Desmarcar todos os cupons" : "Selecionar todos os cupons"}
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={toggleAll}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Selecionar ${row.original.code}`}
          checked={selectedSet.has(row.original.id)}
          onCheckedChange={(checked) => toggleRow(row.original.id, checked)}
        />
      ),
    },
    {
      id: "switch",
      meta: { width: 56 },
      enableSorting: false,
      header: () => <span className="sr-only">Ativo</span>,
      cell: ({ row }) => statusSwitch(row.original),
    },
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
      enableSorting: false,
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

      {activeSelectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
          <p className="mr-1 text-sm font-medium">
            {activeSelectedIds.length}{" "}
            {activeSelectedIds.length === 1 ? "selecionado" : "selecionados"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => {
              setFailure(null);
              setBulkDeleteOpen(true);
            }}
          >
            <Trash2 data-icon="inline-start" aria-hidden="true" />
            Excluir
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            Limpar seleção
          </Button>
        </div>
      ) : null}

      {notice ? (
        <Alert>
          <AlertTitle>Alteração aplicada</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Não foi possível concluir a ação</AlertTitle>
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {activeSelectedIds.length}{" "}
              {activeSelectedIds.length === 1 ? "cupom" : "cupons"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cupons que já tiveram resgates ou aparecem em pedidos são desativados, e o desconto
              concedido continua no histórico. Os demais são removidos permanentemente. Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate()}
            >
              {bulkDeleteMutation.isPending ? "Excluindo…" : "Excluir cupons"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
