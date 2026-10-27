/**
 * The stock a variation carries, and how an order moves it.
 *
 * The schema says a controlled variation carries a quantity and an unlimited
 * one carries none, and the contract is what says which is which. This is the
 * other half: the quantity moves here, under a row lock, so two checkouts
 * cannot take the same last unit.
 *
 * The row is read with `forUpdate` before it is written. Under the default
 * `READ COMMITTED`, a checkout that waits for the lock reads the committed
 * row, so the second buyer sees the quantity the first one left behind.
 */
import { and } from "@prisma/orm-postgres/orm-client";

import type { DbTransaction } from "./client.ts";

/** One movement: a variation and how many units it takes. */
export type StockLine = {
  readonly variationId: string;
  readonly quantity: number;
};

/** An order line, as the checkout sends it. */
export type StockOrderLine = {
  readonly variationId?: string | null;
  readonly kitId?: string | null;
  readonly quantity: number;
};

/**
 * The result of taking the stock. `ok: false` names the variation that ran
 * out and how many units were left, so the caller can say which one.
 */
export type StockReservation =
  | { readonly ok: true }
  | { readonly ok: false; readonly variationId: string; readonly available: number };

/** The variations each kit names, keyed by the kit. */
async function kitItemsByKit(
  tx: DbTransaction,
  tenantId: string,
  kitIds: readonly string[],
): Promise<Map<string, { variationId: string; quantity: number }[]>> {
  const itemsByKit = new Map<string, { variationId: string; quantity: number }[]>();

  if (kitIds.length === 0) return itemsByKit;

  const kitItems = await tx.orm.public.KitItem.where((item) =>
    and(item.tenantId.eq(tenantId), item.kitId.in([...kitIds])),
  ).all();

  for (const item of kitItems) {
    const bucket = itemsByKit.get(item.kitId) ?? [];

    bucket.push({ variationId: item.variationId, quantity: item.quantity });
    itemsByKit.set(item.kitId, bucket);
  }

  return itemsByKit;
}

/**
 * The stock a set of order lines takes. A line that names a variation takes
 * that variation; a line that names a kit takes the variations the kit names,
 * in the quantity the kit says of each; a line that names neither takes
 * nothing.
 *
 * A kit's contents are part of the catalog, not of the order, so they are read
 * again here rather than copied onto the order. The panel has no way to edit a
 * kit, so what a kit takes does not drift between the reserve and the release.
 */
export async function stockLinesFor(
  tx: DbTransaction,
  tenantId: string,
  lines: readonly StockOrderLine[],
): Promise<StockLine[]> {
  const kitIds = [...new Set(lines.flatMap((line) => (line.kitId ? [line.kitId] : [])))];

  const itemsByKit = await kitItemsByKit(tx, tenantId, kitIds);

  const totals = new Map<string, number>();

  const take = (variationId: string, quantity: number): void => {
    totals.set(variationId, (totals.get(variationId) ?? 0) + quantity);
  };

  for (const line of lines) {
    if (line.variationId) take(line.variationId, line.quantity);

    if (line.kitId) {
      for (const item of itemsByKit.get(line.kitId) ?? []) {
        take(item.variationId, item.quantity * line.quantity);
      }
    }
  }

  return [...totals].map(([variationId, quantity]) => ({ variationId, quantity }));
}

/**
 * Takes the stock of every line. The whole set is taken or none of it is:
 * a line that cannot be satisfied leaves the transaction to roll back, so a
 * half-taken order never exists.
 */
export async function reserveVariationStock(
  tx: DbTransaction,
  tenantId: string,
  lines: readonly StockLine[],
): Promise<StockReservation> {
  for (const line of lines) {
    const variation = await tx.orm.public.Variation.where({ tenantId, id: line.variationId })
      .forUpdate()
      .first();

    if (!variation) return { ok: false, variationId: line.variationId, available: 0 };

    // An unlimited variation has no quantity to take.
    if (variation.stockMode === "unlimited") continue;

    const available = variation.stockQty ?? 0;

    if (available < line.quantity) {
      return { ok: false, variationId: line.variationId, available };
    }

    await tx.orm.public.Variation.where({ tenantId, id: line.variationId }).updateAll({
      stockQty: available - line.quantity,
    });
  }

  return { ok: true };
}

/**
 * Gives the stock back. The same lines that were taken are given back, so a
 * cancelled order leaves the quantity it found.
 */
export async function releaseVariationStock(
  tx: DbTransaction,
  tenantId: string,
  lines: readonly StockLine[],
): Promise<void> {
  for (const line of lines) {
    const variation = await tx.orm.public.Variation.where({ tenantId, id: line.variationId })
      .forUpdate()
      .first();

    if (!variation) continue;

    if (variation.stockMode === "unlimited") continue;

    await tx.orm.public.Variation.where({ tenantId, id: line.variationId }).updateAll({
      stockQty: (variation.stockQty ?? 0) + line.quantity,
    });
  }
}
