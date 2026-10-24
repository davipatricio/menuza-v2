import { randomUUID } from "node:crypto";
import { ORPCError, implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { db } from "@menuza/db";
import { NUTRIENTS } from "@menuza/shared/nutrition";
import { tenantContractObject, type PanelProductNutrition } from "@menuza/shared/tenant";
import { notFound } from "../session/support.ts";
import { loadProduct, toProductDetail } from "./catalog.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.saveProductNutrition,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The writable columns: the panel shape without the two server-managed
 * timestamps. `referenceAt` stays a `Temporal` value here, because that is what
 * `Timestamp(3)` holds; the read side re-attaches the UTC designator.
 */
type NutritionValues = Omit<PanelProductNutrition, "referenceAt" | "updatedAt"> & {
  referenceAt: Temporal.PlainDateTime | null;
};

/** A partial save: an omitted key keeps the stored value, and never clears it. */
function pick<T>(patch: T | undefined, stored: T): T {
  return patch === undefined ? stored : patch;
}

/**
 * The column is UTC-naive, but the contract carries the reference date as an ISO
 * timestamp with a designator (`isoOf` writes a `Z`). `Instant` is the `Temporal`
 * type that parses that form, so the conversion goes through UTC.
 */
function referenceInstant(value: string | null): Temporal.PlainDateTime | null {
  if (value === null) return null;

  return Temporal.Instant.from(value).toZonedDateTimeISO("UTC").toPlainDateTime();
}

function validationFailed(message: string) {
  return new ORPCError("VALIDATION_FAILED", {
    message,
    data: { code: "VALIDATION_FAILED" },
  });
}

/**
 * The 100 g/mL ordering rules, applied to the merged row: the contract's schema
 * can only compare the fields a single payload carries, and a patch may fill one
 * side of each comparison. The columns' check constraints are the same rules.
 */
function assertConsistent(values: NutritionValues): void {
  for (const nutrient of NUTRIENTS) {
    const value = values[nutrient.key];

    if (value !== null && value < 0) {
      throw validationFailed(`${nutrient.label} não pode ser negativo.`);
    }
  }

  const { addedSugarsMg, totalSugarsMg, saturatedFatMg, transFatMg, totalFatMg } = values;

  if (addedSugarsMg !== null && totalSugarsMg !== null && addedSugarsMg > totalSugarsMg) {
    throw validationFailed("Açúcares adicionados não podem passar dos açúcares totais.");
  }

  if (
    saturatedFatMg !== null &&
    transFatMg !== null &&
    totalFatMg !== null &&
    saturatedFatMg + transFatMg > totalFatMg
  ) {
    throw validationFailed("Saturadas e trans não podem passar das gorduras totais.");
  }
}

/** Everything a published label still lacks, named the way the table names it. */
function missingFields(values: NutritionValues): string[] {
  const missing = NUTRIENTS.flatMap((nutrient) =>
    values[nutrient.key] === null ? [nutrient.label] : [],
  );

  if (values.portionMilli === null || values.portionMilli <= 0) missing.push("Porção");

  if (values.servingsPerPack === null || values.servingsPerPack <= 0) {
    missing.push("Porções por embalagem");
  }

  if (values.householdMeasure === null || values.householdMeasure.trim() === "") {
    missing.push("Medida caseira");
  }

  return missing;
}

/**
 * A half-filled label on the storefront is worse than none, so publishing is
 * judged on the merged row: a patch that leaves a required field out of the
 * payload is still answered with what the row will contain.
 */
function assertPublishable(values: NutritionValues): void {
  if (!values.published) return;

  const missing = missingFields(values);

  if (missing.length === 0) return;

  throw validationFailed(`Para publicar a tabela nutricional, preencha: ${missing.join(", ")}.`);
}

/**
 * The product's label, saved partially like `updateProduct`: an omitted field
 * keeps the stored value and `null` clears it. The stored row is merged into the
 * payload before validation, because both the cross-field rules and the
 * publishing checklist describe the row, not the patch.
 *
 * One row per product, so a create and an update are the two ends of the same
 * call; a missing row is created with the contract's defaults.
 */
export const saveProductNutritionImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const product = await inTenantScope(store.tenantId, () =>
    db.orm.public.Product.where({ tenantId: store.tenantId, id: input.productId })
      .select("id")
      .first(),
  );

  if (!product) throw notFound();

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.ProductNutrition.where({
      tenantId: store.tenantId,
      productId: input.productId,
    }).first(),
  );

  // `undefined` keeps the stored value; the `??` half only ever applies on
  // create, where it installs the column default.
  const values: NutritionValues = {
    basis: pick(input.basis, existing?.basis ?? "solid"),
    labelFormat: pick(input.labelFormat, existing?.labelFormat ?? "vertical"),
    source: pick(input.source, existing?.source ?? "manual"),
    referenceAt:
      input.referenceAt === undefined
        ? (existing?.referenceAt ?? null)
        : referenceInstant(input.referenceAt),
    energyKcal: pick(input.energyKcal, existing?.energyKcal ?? null),
    carbsMg: pick(input.carbsMg, existing?.carbsMg ?? null),
    totalSugarsMg: pick(input.totalSugarsMg, existing?.totalSugarsMg ?? null),
    addedSugarsMg: pick(input.addedSugarsMg, existing?.addedSugarsMg ?? null),
    proteinMg: pick(input.proteinMg, existing?.proteinMg ?? null),
    totalFatMg: pick(input.totalFatMg, existing?.totalFatMg ?? null),
    saturatedFatMg: pick(input.saturatedFatMg, existing?.saturatedFatMg ?? null),
    transFatMg: pick(input.transFatMg, existing?.transFatMg ?? null),
    fiberMg: pick(input.fiberMg, existing?.fiberMg ?? null),
    sodiumMg: pick(input.sodiumMg, existing?.sodiumMg ?? null),
    portionMilli: pick(input.portionMilli, existing?.portionMilli ?? null),
    householdMeasure: pick(input.householdMeasure, existing?.householdMeasure ?? null),
    servingsPerPack: pick(input.servingsPerPack, existing?.servingsPerPack ?? null),
    showHighAddedSugar: pick(input.showHighAddedSugar, existing?.showHighAddedSugar ?? false),
    showHighSatFat: pick(input.showHighSatFat, existing?.showHighSatFat ?? false),
    showHighSodium: pick(input.showHighSodium, existing?.showHighSodium ?? false),
    published: pick(input.published, existing?.published ?? false),
    notes: pick(input.notes, existing?.notes ?? null),
  };

  assertConsistent(values);
  assertPublishable(values);

  await inTenantScope(store.tenantId, async () => {
    const updatedAt = now();

    if (existing) {
      // `update` drops every non-unique predicate from the WHERE in Prisma 8;
      // `updateAll` keeps the tenant guard and still targets the one row.
      await db.orm.public.ProductNutrition.where({
        tenantId: store.tenantId,
        productId: input.productId,
      }).updateAll({ ...values, updatedAt });

      return;
    }

    await db.orm.public.ProductNutrition.create({
      id: randomUUID(),
      tenantId: store.tenantId,
      productId: input.productId,
      ...values,
      updatedAt,
    });
  });

  const updated = await inTenantScope(store.tenantId, () =>
    loadProduct(db, store.tenantId, input.productId),
  );

  if (!updated) throw notFound();

  return { product: toProductDetail(updated) };
});

export type SaveProductNutritionImpl = typeof saveProductNutritionImpl;
