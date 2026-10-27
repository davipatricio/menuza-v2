/**
 * Plumbing shared by the three taxonomy levels.
 *
 * A product never names a category or a department directly: it hangs off a
 * subcategory, the subcategory off a category, and a category can appear under
 * many departments. Every helper here walks that chain once, so the list and
 * write procedures do not each re-derive it.
 */
import { randomUUID } from "node:crypto";
import { notFound } from "../session/support.ts";
import type { CatalogTx } from "./catalog.ts";

/** The fallback subcategory a category receives when none was chosen. */
export const generalSubcategoryName = "Geral";

/** `Timestamp(3)` is a UTC-naive `Temporal.PlainDateTime`; the contract wants ISO. */
export function isoOf(value: Temporal.PlainDateTime): string {
  return `${value.toString({ smallestUnit: "second" })}Z`;
}

/** The value every write stamps on `updatedAt` (the column has a default, not a trigger). */
export function now(): Temporal.PlainDateTime {
  return Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();
}

/** The category's `Geral` subcategory, created on first use. */
export async function ensureGeneralSubcategory(
  tx: CatalogTx,
  tenantId: string,
  categoryId: string,
) {
  const existing = await tx.orm.public.Subcategory.where({
    tenantId,
    categoryId,
    name: generalSubcategoryName,
  }).first();

  if (existing) return existing;

  return tx.orm.public.Subcategory.create({
    id: randomUUID(),
    tenantId,
    categoryId,
    name: generalSubcategoryName,
    sortOrder: 0,
    active: true,
    updatedAt: now(),
  });
}

/** Every department id must belong to the store; otherwise `NOT_FOUND`. */
export async function assertOwnedDepartments(
  tx: CatalogTx,
  tenantId: string,
  departmentIds: readonly string[],
): Promise<void> {
  for (const departmentId of new Set(departmentIds)) {
    const department = await tx.orm.public.Department.where({
      tenantId,
      id: departmentId,
    }).first();

    if (!department) throw notFound();
  }
}

/** Replaces a category's department links with the given set. */
export async function replaceCategoryDepartments(
  tx: CatalogTx,
  tenantId: string,
  categoryId: string,
  departmentIds: readonly string[],
): Promise<void> {
  await tx.orm.public.CategoryDepartment.where({ tenantId, categoryId }).deleteAll();

  for (const departmentId of new Set(departmentIds)) {
    await tx.orm.public.CategoryDepartment.create({ tenantId, categoryId, departmentId });
  }
}

/** Category ids linked to a department, verified against the tenant. */
export async function linkedCategoryIds(
  tx: CatalogTx,
  tenantId: string,
  departmentId: string,
): Promise<string[]> {
  const links = await tx.orm.public.CategoryDepartment.where({ tenantId, departmentId })
    .select("categoryId")
    .all();

  if (links.length === 0) return [];

  const wanted = new Set(links.map((link) => link.categoryId));

  const owned = await tx.orm.public.Category.where({ tenantId }).select("id").all();

  return owned.flatMap((row) => (wanted.has(row.id) ? [row.id] : []));
}

/** Subcategory ids under the given categories, tenant-scoped. */
export async function subcategoryIdsOf(
  tx: CatalogTx,
  tenantId: string,
  categoryIds: readonly string[],
): Promise<string[]> {
  if (categoryIds.length === 0) return [];

  const wanted = new Set(categoryIds);

  const rows = await tx.orm.public.Subcategory.where({ tenantId }).select("id", "categoryId").all();

  return rows.flatMap((row) => (wanted.has(row.categoryId) ? [row.id] : []));
}

/** Products attached to any of the given categories, through their subcategories. */
export async function productCountOf(
  tx: CatalogTx,
  tenantId: string,
  categoryIds: readonly string[],
): Promise<number> {
  const subcategoryIds = new Set(await subcategoryIdsOf(tx, tenantId, categoryIds));

  if (subcategoryIds.size === 0) return 0;

  const products = await tx.orm.public.Product.where({ tenantId })
    .select("id", "subcategoryId")
    .all();

  return products.filter(
    (product) => product.subcategoryId !== null && subcategoryIds.has(product.subcategoryId),
  ).length;
}

/** Products grouped under a department, through category links and subcategories. */
export async function departmentProductCount(
  tx: CatalogTx,
  tenantId: string,
  departmentId: string,
): Promise<number> {
  const categoryIds = await linkedCategoryIds(tx, tenantId, departmentId);

  return productCountOf(tx, tenantId, categoryIds);
}

/**
 * Moves every product of a department's categories into the target category's
 * `Geral` subcategory. Used when a department is deactivated with products
 * still inside it.
 */
export async function moveProductsToCategory(
  tx: CatalogTx,
  tenantId: string,
  departmentId: string,
  targetCategoryId: string,
): Promise<number> {
  const categoryIds = await linkedCategoryIds(tx, tenantId, departmentId);

  if (categoryIds.length === 0) return 0;

  const subcategoryIds = new Set(await subcategoryIdsOf(tx, tenantId, categoryIds));

  if (subcategoryIds.size === 0) return 0;

  const products = await tx.orm.public.Product.where({ tenantId })
    .select("id", "subcategoryId")
    .all();

  const moving = products.filter(
    (product) => product.subcategoryId !== null && subcategoryIds.has(product.subcategoryId),
  );

  if (moving.length === 0) return 0;

  const general = await ensureGeneralSubcategory(tx, tenantId, targetCategoryId);

  for (const product of moving) {
    await tx.orm.public.Product.where({ tenantId, id: product.id }).updateAll({
      subcategoryId: general.id,
      updatedAt: now(),
    });
  }

  return moving.length;
}

/**
 * The department ids a category belongs to, keyed by category id. One query for
 * the links and one for the names; callers render both.
 */
export async function departmentLinksByCategory(
  tx: CatalogTx,
  tenantId: string,
): Promise<{ ids: Map<string, string[]>; names: Map<string, string[]> }> {
  const links = await tx.orm.public.CategoryDepartment.where({ tenantId }).all();

  const departments = await tx.orm.public.Department.where({ tenantId }).select("id", "name").all();

  const nameById = new Map(departments.map((department) => [department.id, department.name]));

  const pairs = new Map<string, { id: string; name: string }[]>();

  for (const link of links) {
    const name = nameById.get(link.departmentId);

    if (name === undefined) continue;

    pairs.set(link.categoryId, [
      ...(pairs.get(link.categoryId) ?? []),
      { id: link.departmentId, name },
    ]);
  }

  const ids = new Map<string, string[]>();
  const names = new Map<string, string[]>();

  for (const [categoryId, entries] of pairs) {
    entries.sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));

    ids.set(
      categoryId,
      entries.map((entry) => entry.id),
    );
    names.set(
      categoryId,
      entries.map((entry) => entry.name),
    );
  }

  return { ids, names };
}
