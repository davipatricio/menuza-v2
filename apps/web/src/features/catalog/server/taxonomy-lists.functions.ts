/**
 * Server functions for the catalog taxonomy screens (departments, categories,
 * subcategories, tags, badges).
 *
 * One module per concern would be noise: the five lists share the panel client,
 * the same null-on-no-session contract and the same row types, and the routes
 * only ever import the function they need, so nothing extra reaches the router
 * graph.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { panelClient } from "@/server/panel-client.ts";

const status = v.optional(v.picklist(["all", "active", "inactive"]), "all");

const order = v.optional(v.picklist(["asc", "desc"]), "asc");

const q = v.optional(v.string(), "");

export const listDepartmentsFn = createServerFn({ method: "GET" })
  .validator(
    v.object({
      storeSlug: v.string(),
      q,
      status,
      sort: v.optional(v.picklist(["name", "itemsCount", "updatedAt"]), "name"),
      order,
    }),
  )
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listDepartments({
      storeSlug: data.storeSlug,
      q: data.q,
      status: data.status,
      sortBy: data.sort,
      order: data.order,
    });
  });

export const listCategoriesFn = createServerFn({ method: "GET" })
  .validator(
    v.object({
      storeSlug: v.string(),
      q,
      status,
      departmentId: v.optional(v.string(), ""),
      sort: v.optional(v.picklist(["name", "itemsCount", "updatedAt", "sortOrder"]), "sortOrder"),
      order,
    }),
  )
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listCategories({
      storeSlug: data.storeSlug,
      q: data.q,
      status: data.status,
      departmentId: data.departmentId,
      sortBy: data.sort,
      order: data.order,
    });
  });

export const listSubcategoriesFn = createServerFn({ method: "GET" })
  .validator(
    v.object({
      storeSlug: v.string(),
      q,
      status,
      categoryId: v.optional(v.string(), ""),
      sort: v.optional(v.picklist(["name", "itemsCount", "updatedAt", "sortOrder"]), "sortOrder"),
      order,
    }),
  )
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listSubcategories({
      storeSlug: data.storeSlug,
      q: data.q,
      status: data.status,
      categoryId: data.categoryId,
      sortBy: data.sort,
      order: data.order,
    });
  });

export const listTagsFn = createServerFn({ method: "GET" })
  .validator(
    v.object({
      storeSlug: v.string(),
      sort: v.optional(v.picklist(["name", "itemsCount"]), "name"),
      order,
    }),
  )
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listTags({
      storeSlug: data.storeSlug,
      sortBy: data.sort,
      order: data.order,
    });
  });

export const listKitsFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listKits({ storeSlug: data.storeSlug });
  });

export const listBadgesFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listBadges({ storeSlug: data.storeSlug });
  });

/**
 * The two option lists the taxonomy dialogs need (department select, category
 * select). Loaded once per page instead of per row.
 */
export const listTaxonomyOptionsFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    const [departments, categories] = await Promise.all([
      client.panel.listDepartments({ storeSlug: data.storeSlug }),
      client.panel.listCategories({ storeSlug: data.storeSlug }),
    ]);

    return {
      departments: departments.departments.map((row) => ({ id: row.id, name: row.name })),
      categories: categories.categories.map((row) => ({
        id: row.id,
        name: row.name,
        departmentIds: row.departmentIds,
      })),
    };
  });

export type PanelDepartmentsPayload = NonNullable<Awaited<ReturnType<typeof listDepartmentsFn>>>;

export type PanelCategoriesPayload = NonNullable<Awaited<ReturnType<typeof listCategoriesFn>>>;

export type PanelSubcategoriesPayload = NonNullable<
  Awaited<ReturnType<typeof listSubcategoriesFn>>
>;

export type PanelTagsPayload = NonNullable<Awaited<ReturnType<typeof listTagsFn>>>;

export type PanelBadgesPayload = NonNullable<Awaited<ReturnType<typeof listBadgesFn>>>;

export type PanelTaxonomyOptions = NonNullable<Awaited<ReturnType<typeof listTaxonomyOptionsFn>>>;

export type DepartmentRow = PanelDepartmentsPayload["departments"][number];

export type CategoryRow = PanelCategoriesPayload["categories"][number];

export type SubcategoryRow = PanelSubcategoriesPayload["subcategories"][number];

export type TagRow = PanelTagsPayload["tags"][number];

export type BadgeRow = PanelBadgesPayload["badges"][number];
