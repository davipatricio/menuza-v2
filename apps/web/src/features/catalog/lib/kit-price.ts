/**
 * Preço de um kit, em centavos, na mesma ordem que o servidor usa:
 *
 * 1. O subtotal é `baseCents` mais o adicional dos pratos com valor extra (`extraCents`).
 * 2. O percentual do kit incide sobre esse total.
 * 3. A faixa progressiva incide por último, pela quantidade de kits no pedido.
 *
 * É função pura: a prévia do editor e o checkout precisam concordar, e um teste
 * cobre os três passos.
 */

export type KitBand = { minQuantity: number; percent: number };

/** O total de um kit antes das faixas progressivas. */
export function kitUnitCents(input: {
  baseCents: number;
  percentOff: number | null;
  extraCents?: number;
}) {
  const extra = Math.max(0, input.extraCents ?? 0);
  const subtotalCents = Math.max(0, input.baseCents) + extra;

  const percent = clampPercent(input.percentOff);
  const discountCents = Math.floor((subtotalCents * percent) / 100);

  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

/** A faixa que vale para `kitCount` kits: a maior `minQuantity` alcançada. */
export function kitBandFor(bands: KitBand[], kitCount: number): KitBand | null {
  let found: KitBand | null = null;

  for (const band of bands) {
    if (band.minQuantity > kitCount) continue;

    if (found === null || band.minQuantity > found.minQuantity) found = band;
  }

  return found;
}

/**
 * O total do pedido para `kitCount` kits iguais. A faixa não é cumulativa: só a
 * maior alcançada incide, sobre o total já descontado do kit.
 */
export function kitOrderCents(input: { unitCents: number; kitCount: number; bands: KitBand[] }) {
  const gross = input.unitCents * input.kitCount;
  const band = kitBandFor(input.bands, input.kitCount);
  const percent = band === null ? 0 : clampPercent(band.percent);
  const discountCents = Math.floor((gross * percent) / 100);

  return { band, discountCents, totalCents: gross - discountCents };
}

function clampPercent(percent: number | null): number {
  if (percent === null || !Number.isFinite(percent) || percent <= 0) return 0;

  return Math.min(100, percent);
}
