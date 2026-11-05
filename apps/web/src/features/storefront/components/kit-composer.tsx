import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { kitUnitCents } from "@/features/catalog/lib/kit-price.ts";
import type { PublicKit } from "@/lib/api/model";
import { formatBrl } from "@/lib/format.ts";

type Selection = Record<string, number>;

function defaultSelection(kit: PublicKit) {
  const selection: Selection = {};

  for (const item of kit.items) {
    selection[item.id] = kit.kind === "fixed" ? (item.quantity ?? 1) : (item.minQty ?? 0);
  }

  return selection;
}

function groupTotals(kit: PublicKit, selection: Selection) {
  const totals = new Map<string, number>();

  for (const item of kit.items) {
    const key = item.groupId ?? "";

    totals.set(key, (totals.get(key) ?? 0) + (selection[item.id] ?? 0));
  }

  return totals;
}

/**
 * The kit composer. Everything the buyer changes stays local until checkout;
 * the server revalidates the same minimums, steps and stock before pricing.
 */
export function KitComposer({ kit }: { kit: PublicKit }) {
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(kit));
  const [swaps, setSwaps] = useState<Record<string, string>>({});

  const chosen = kit.items.reduce((sum, item) => {
    const quantity = selection[item.id] ?? 0;
    const variationId = swaps[item.id];
    const swap = item.swapVariations.find((option) => option.id === variationId);

    return sum + (swap?.priceCents ?? item.priceCents) * quantity;
  }, 0);

  const price = kitUnitCents({
    pricingMode: kit.pricingMode === "sum" ? "sum" : "fixed",
    baseCents: kit.baseCents,
    percentOff: kit.percentOff,
    chosenCents: [chosen],
  });

  const totals = groupTotals(kit, selection);
  const itemCount = Object.values(selection).reduce((sum, quantity) => sum + quantity, 0);

  const problems: string[] = [];

  if (kit.minItems !== null && itemCount < kit.minItems) {
    problems.push(`Escolha ao menos ${kit.minItems} ${kit.minItems === 1 ? "item" : "itens"}.`);
  }

  if (kit.maxItems !== null && itemCount > kit.maxItems) {
    problems.push(`Escolha no máximo ${kit.maxItems} ${kit.maxItems === 1 ? "item" : "itens"}.`);
  }

  for (const item of kit.items) {
    const quantity = selection[item.id] ?? 0;

    if (quantity < (item.minQty ?? 0)) {
      problems.push(`Inclua ao menos ${item.minQty} de ${item.productName}.`);
    }

    if (item.maxQty !== null && quantity > item.maxQty) {
      problems.push(`Remova ${item.productName}: o máximo é ${item.maxQty}.`);
    }

    if (!item.available && quantity > 0) {
      problems.push(`${item.productName} está esgotado.`);
    }
  }

  for (const group of kit.groups) {
    const count = totals.get(group.id) ?? 0;

    if (group.minItems !== null && count < group.minItems) {
      problems.push(`Escolha ao menos ${group.minItems} em ${group.name}.`);
    }

    if (group.maxItems !== null && count > group.maxItems) {
      problems.push(`Escolha no máximo ${group.maxItems} em ${group.name}.`);
    }
  }

  const canSubmit = kit.available && problems.length === 0;

  function step(itemId: string, delta: number, size: number, min: number, max: number | null) {
    setSelection((current) => {
      const next = (current[itemId] ?? 0) + delta * size;
      const clamped = Math.max(min, max === null ? next : Math.min(next, max));

      return { ...current, [itemId]: clamped };
    });
  }

  const ungroupedItems = kit.items.filter(
    (item) => !item.groupId || !kit.groups.some((g) => g.id === item.groupId),
  );

  const renderDishRow = (item: PublicKit["items"][number]) => (
    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`item-${item.id}`}>{item.productName}</Label>
        <span className="text-xs text-muted-foreground">
          {item.available ? item.variationName : "Esgotado"}
          {item.minQty ? ` · mínimo ${item.minQty}` : ""}
          {item.maxQty !== null ? ` · máximo ${item.maxQty}` : ""}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {item.swapVariations.length > 0 ? (
          <Select
            value={swaps[item.id] ?? item.variationId}
            onValueChange={(next) => {
              if (next === null) return;

              setSwaps((current) => ({ ...current, [item.id]: next }));
            }}
          >
            <SelectTrigger className="w-44" aria-label={`Variação de ${item.productName}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={item.variationId}>{item.variationName}</SelectItem>
              {item.swapVariations.map((option) => (
                <SelectItem key={option.id} value={option.id} disabled={!option.available}>
                  {option.name} · {formatBrl(option.priceCents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {kit.kind === "fixed" ? (
          <span className="text-sm tabular-nums">{item.quantity ?? 1}×</span>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Remover um de ${item.productName}`}
              disabled={(selection[item.id] ?? 0) <= (item.minQty ?? 0)}
              onClick={() => step(item.id, -1, item.step, item.minQty ?? 0, item.maxQty)}
            >
              −
            </Button>
            <span id={`item-${item.id}`} className="w-8 text-center text-sm tabular-nums">
              {selection[item.id] ?? 0}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Adicionar um de ${item.productName}`}
              disabled={
                !item.available ||
                (item.maxQty !== null && (selection[item.id] ?? 0) >= item.maxQty)
              }
              onClick={() => step(item.id, 1, item.step, item.minQty ?? 0, item.maxQty)}
            >
              +
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line nextjs/no-img-element -- tenant asset, not a Next app */}
          <img src={kit.imageUrl} alt={kit.name} className="size-full object-cover" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{kit.name}</h1>
        {kit.description ? (
          <p className="text-sm text-pretty text-muted-foreground">{kit.description}</p>
        ) : null}
        {!kit.available ? <Badge variant="outline">Indisponível no momento</Badge> : null}
      </div>

      {kit.groups.map((group) => {
        const items = kit.items.filter((item) => item.groupId === group.id);

        if (items.length === 0) return null;

        return (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle>{group.name}</CardTitle>
              <CardDescription>
                {group.minItems !== null ? `Mínimo ${group.minItems}. ` : ""}
                {group.maxItems !== null ? `Máximo ${group.maxItems}.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">{items.map(renderDishRow)}</CardContent>
          </Card>
        );
      })}

      {ungroupedItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{kit.groups.length > 0 ? "Outros pratos" : "Pratos do kit"}</CardTitle>
            <CardDescription>
              {kit.groups.length > 0
                ? "Pratos incluídos fora dos grupos."
                : "Escolha as opções do seu kit."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {ungroupedItems.map(renderDishRow)}
          </CardContent>
        </Card>
      ) : null}

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {itemCount === 1 ? "1 item" : `${itemCount} itens`}
          </span>
          <span className="text-lg font-semibold tabular-nums">{formatBrl(price.totalCents)}</span>
          {price.discountCents > 0 ? (
            <span className="text-xs text-muted-foreground">
              {formatBrl(price.subtotalCents)} com {formatBrl(price.discountCents)} de desconto
            </span>
          ) : null}
        </div>

        <Button type="button" disabled={!canSubmit}>
          Adicionar ao carrinho
        </Button>
      </div>

      {problems.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-destructive" role="status">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
