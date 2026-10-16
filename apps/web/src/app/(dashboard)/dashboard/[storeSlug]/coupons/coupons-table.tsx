"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { PanelCoupon } from "@menuza/shared/tenant";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { formatBrl } from "@/lib/format.ts";
import {
  COUPON_STATUS_LABELS,
  COUPON_STATUS_VARIANTS,
  DISCOUNT_TYPE_LABELS,
} from "@/lib/panel-labels.ts";

async function getCoupons(storeSlug: string): Promise<PanelCoupon[]> {
  const { createORPCClient } = await import("@orpc/client");
  const { RPCLink } = await import("@orpc/client/fetch");
  const { tenantContractObject } = await import("@menuza/shared/tenant");

  type ContractClient = import("@orpc/contract").RouterContractClient<typeof tenantContractObject>;

  const client = createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));

  return (await client.panel.listCoupons({ storeSlug })).coupons;
}

/** One scale for screen and CSV: percent coupons read as "15%", fixed ones as BRL. */
function formatDiscount(coupon: PanelCoupon): string {
  const base =
    coupon.valuePercent !== null ? `${coupon.valuePercent}%` : formatBrl(coupon.valueCents ?? 0);

  // The freight discount rides along with the order discount, so the cell and
  // the CSV both show it instead of leaving it invisible after save.
  return coupon.shippingDiscountPercent === null
    ? base
    : `${base} + frete ${coupon.shippingDiscountPercent}%`;
}

export function CouponsTable({
  coupons: initialCoupons,
  storeSlug,
}: {
  coupons: PanelCoupon[];
  storeSlug: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["tenant", storeSlug, "coupons"] as const;
  const [confirming, setConfirming] = useState<PanelCoupon | null>(null);

  const { data } = useQuery({
    queryKey,
    queryFn: () => getCoupons(storeSlug),
    initialData: initialCoupons,
  });

  const items = data ?? initialCoupons;

  const deleteMutation = useMutation({
    mutationFn: async (couponId: string) => {
      const { createORPCClient } = await import("@orpc/client");
      const { RPCLink } = await import("@orpc/client/fetch");
      const { tenantContractObject } = await import("@menuza/shared/tenant");

      type ContractClient = import("@orpc/contract").RouterContractClient<
        typeof tenantContractObject
      >;

      const client = createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
      await client.panel.deleteCoupon({ storeSlug, couponId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const pendingId = deleteMutation.isPending ? deleteMutation.variables : undefined;

  const columns: ColumnDef<typeof dashboardTableFeatures, PanelCoupon, unknown>[] = [
    { accessorKey: "code", header: "Cupom" },
    {
      accessorKey: "discountType",
      header: "Tipo",
      cell: ({ row }) => DISCOUNT_TYPE_LABELS[row.original.discountType],
    },
    {
      accessorKey: "valueCents",
      header: "Desconto",
      cell: ({ row }) => <span className="tabular-nums">{formatDiscount(row.original)}</span>,
    },
    {
      accessorKey: "usageCount",
      header: "Usos",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.usageLimit === null
            ? row.original.usageCount
            : `${row.original.usageCount} / ${row.original.usageLimit}`}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={COUPON_STATUS_VARIANTS[row.original.status]}>
          {COUPON_STATUS_LABELS[row.original.status]}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Ações",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/dashboard/${storeSlug}/coupons/${row.original.id}`}
                aria-label={`Editar cupom ${row.original.code}`}
              />
            }
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={pendingId === row.original.id}
            onClick={() => setConfirming(row.original)}
          >
            {pendingId === row.original.id ? <Spinner data-icon="inline-start" /> : null}
            {pendingId === row.original.id ? "Excluindo…" : "Excluir"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          nativeButton={false}
          render={<Link href={`/dashboard/${storeSlug}/coupons/new`} aria-label="Novo cupom" />}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Novo cupom
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={items}
        tableLabel="Cupons"
        searchPlaceholder="Buscar por código de cupom…"
        searchLabel="Filtrar cupons"
        exportFilename={`cupons-${storeSlug}`}
        rowHref={(coupon) => `/dashboard/${storeSlug}/coupons/${coupon.id}`}
        exportColumns={[
          { key: "code", label: "Código" },
          {
            key: "discountType",
            label: "Tipo",
            accessor: (r) => DISCOUNT_TYPE_LABELS[r.discountType],
          },
          { key: "value", label: "Valor", accessor: (r) => formatDiscount(r) },
          { key: "usageCount", label: "Usos" },
          { key: "status", label: "Status", accessor: (r) => COUPON_STATUS_LABELS[r.status] },
        ]}
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
              O cupom será removido permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!confirming) return;
                deleteMutation.mutate(confirming.id, { onSuccess: () => setConfirming(null) });
              }}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir cupom"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
