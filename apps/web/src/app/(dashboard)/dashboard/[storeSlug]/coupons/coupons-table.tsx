"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { PanelCoupon } from "@menuza/shared/tenant";
import type { RouterContractClient } from "@orpc/contract";
import type { tenantContractObject } from "@menuza/shared/tenant";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { formatBrl } from "@/lib/format.ts";
import {
  COUPON_STATUS_LABELS,
  COUPON_STATUS_VARIANTS,
  DISCOUNT_TYPE_LABELS,
} from "@/lib/panel-labels.ts";

type TenantClient = RouterContractClient<typeof tenantContractObject>;

function client(): TenantClient {
  return createORPCClient<TenantClient>(new RPCLink({ url: "/tenant/rpc" }));
}

function splitValue(coupon: PanelCoupon) {
  return coupon.discountType === "fixed" ? coupon.valueCents ?? 0 : coupon.valuePercent ?? 0;
}

function blankCoupon(): PanelCoupon {
  return {
    id: "",
    code: "",
    description: null,
    discountType: "percentage",
    valueCents: null,
    valuePercent: 0,
    usageCount: 0,
    usageLimit: null,
    perCustomerLimit: null,
    minimumOrderCents: null,
    maximumDiscountCents: null,
    startsAt: null,
    endsAt: null,
    stackable: false,
    firstPurchaseOnly: false,
    status: "active",
  };
}

interface FormState {
  code: string;
  description: string;
  discountType: "fixed" | "percentage";
  discountValue: string;
  usageLimit: string;
  perCustomerLimit: string;
  minimumOrderCents: string;
  maximumDiscountCents: string;
  startsAt: string;
  endsAt: string;
  stackable: boolean;
  firstPurchaseOnly: boolean;
  status: "active" | "expired" | "disabled";
}

function couponToForm(coupon: PanelCoupon): FormState {
  return {
    code: coupon.code,
    description: coupon.description ?? "",
    discountType: coupon.discountType,
    discountValue: String(splitValue(coupon)),
    usageLimit: coupon.usageLimit == null ? "" : String(coupon.usageLimit),
    perCustomerLimit: coupon.perCustomerLimit == null ? "" : String(coupon.perCustomerLimit),
    minimumOrderCents: coupon.minimumOrderCents == null ? "" : String(coupon.minimumOrderCents),
    maximumDiscountCents: coupon.maximumDiscountCents == null ? "" : String(coupon.maximumDiscountCents),
    startsAt: coupon.startsAt ? coupon.startsAt.slice(0, 10) : "",
    endsAt: coupon.endsAt ? coupon.endsAt.slice(0, 10) : "",
    stackable: coupon.stackable,
    firstPurchaseOnly: coupon.firstPurchaseOnly,
    status: coupon.status,
  };
}

function toPayload(storeSlug: string, form: FormState) {
  return {
    storeSlug,
    code: form.code.trim().toUpperCase(),
    description: form.description.trim() || undefined,
    discountType: form.discountType,
    discountValue: Number(form.discountValue),
    usageLimit: form.usageLimit === "" ? undefined : Number(form.usageLimit),
    perCustomerLimit: form.perCustomerLimit === "" ? undefined : Number(form.perCustomerLimit),
    minimumOrderCents: form.minimumOrderCents === "" ? undefined : Number(form.minimumOrderCents),
    maximumDiscountCents: form.maximumDiscountCents === "" ? undefined : Number(form.maximumDiscountCents),
    startsAt: form.startsAt === "" ? null : form.startsAt,
    endsAt: form.endsAt === "" ? null : form.endsAt,
    stackable: form.stackable,
    firstPurchaseOnly: form.firstPurchaseOnly,
    status: form.status,
  };
}

export function CouponsTable({
  coupons: initialCoupons,
  storeSlug,
}: {
  coupons: PanelCoupon[];
  storeSlug: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialCoupons);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PanelCoupon | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(couponToForm(blankCoupon()));

  const openCreate = () => {
    setEditing(null);
    setForm(couponToForm(blankCoupon()));
    setError(null);
    setOpen(true);
  };

  const openEdit = (coupon: PanelCoupon) => {
    setEditing(coupon);
    setForm(couponToForm(coupon));
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    if (!form.code.trim()) return;
    setPending(true);
    setError(null);
    try {
      const payload = toPayload(storeSlug, form);
      if (editing) {
        const result = await client().panel.updateCoupon({ ...payload, couponId: editing.id });
        setItems((prev) => prev.map((item) => (item.id === editing.id ? result.coupon : item)).sort((a, b) => a.code.localeCompare(b.code)));
      } else {
        const result = await client().panel.createCoupon(payload);
        setItems((prev) => [...prev, result.coupon].sort((a, b) => a.code.localeCompare(b.code)));
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar cupom.");
    } finally {
      setPending(false);
    }
  };

  const remove = async (coupon: PanelCoupon) => {
    if (!window.confirm(`Excluir o cupom "${coupon.code}"?`)) return;
    setPending(true);
    try {
      await client().panel.deleteCoupon({ storeSlug, couponId: coupon.id });
      setItems((prev) => prev.filter((item) => item.id !== coupon.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir cupom.");
    } finally {
      setPending(false);
    }
  };

  const columns: ColumnDef<typeof dashboardTableFeatures, PanelCoupon, unknown>[] = [
    { accessorKey: "code", header: "Cupom" },
    { accessorKey: "discountType", header: "Tipo", cell: ({ row }) => DISCOUNT_TYPE_LABELS[row.original.discountType] },
    { accessorKey: "valueCents", header: "Desconto", cell: ({ row }) => <span className="tabular-nums">{row.original.valuePercent !== null ? `${row.original.valuePercent}%` : formatBrl(row.original.valueCents ?? 0)}</span> },
    { accessorKey: "usageCount", header: "Usos", cell: ({ row }) => <span className="tabular-nums">{row.original.usageCount}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={COUPON_STATUS_VARIANTS[row.original.status]}>{COUPON_STATUS_LABELS[row.original.status]}</Badge> },
    {
      id: "actions",
      header: "Ações",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(row.original)} disabled={pending}>Editar</Button>
          <Button size="sm" variant="destructive" onClick={() => void remove(row.original)} disabled={pending}>Excluir</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{items.length} cupons cadastrados.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button onClick={openCreate} type="button">Novo cupom</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar cupom" : "Novo cupom"}</DialogTitle>
              <DialogDescription>Configure o código, desconto e limites do cupom.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Código</span><Input value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="PROMO10" /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Descrição</span><Input value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Detalhes internos" /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Tipo</span>
                <Select value={form.discountType} onValueChange={(value) => setForm((prev) => ({ ...prev, discountType: value as "fixed" | "percentage" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentual</SelectItem>
                    <SelectItem value="fixed">Valor fixo</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Valor</span><Input type="number" min={1} value={form.discountValue} onChange={(event) => setForm((prev) => ({ ...prev, discountValue: event.target.value }))} placeholder={form.discountType === "percentage" ? "10" : "1500"} /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Status</span>
                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as "active" | "expired" | "disabled" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="disabled">Desativado</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Início</span><Input type="date" value={form.startsAt} onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))} /></label>
                <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Fim</span><Input type="date" value={form.endsAt} onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Limite usos</span><Input type="number" min={1} value={form.usageLimit} onChange={(event) => setForm((prev) => ({ ...prev, usageLimit: event.target.value }))} /></label>
                <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Limite por cliente</span><Input type="number" min={1} value={form.perCustomerLimit} onChange={(event) => setForm((prev) => ({ ...prev, perCustomerLimit: event.target.value }))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Pedido mínimo (centavos)</span><Input type="number" min={0} value={form.minimumOrderCents} onChange={(event) => setForm((prev) => ({ ...prev, minimumOrderCents: event.target.value }))} /></label>
                <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Desconto máximo (centavos)</span><Input type="number" min={0} value={form.maximumDiscountCents} onChange={(event) => setForm((prev) => ({ ...prev, maximumDiscountCents: event.target.value }))} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.stackable} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, stackable: Boolean(checked) }))} />Permite empilhamento com outros cupons</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.firstPurchaseOnly} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, firstPurchaseOnly: Boolean(checked) }))} />Somente primeira compra</label>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="button" disabled={pending} onClick={() => void submit()}>{pending ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {items.length ? <DataTable columns={columns} data={items} tableLabel="Cupons" searchPlaceholder="Buscar por código de cupom…" searchLabel="Filtrar cupons" /> : <p className="text-sm text-muted-foreground">Nenhum cupom ainda. Crie o primeiro cupom acima.</p>}
    </div>
  );
}
