/**
 * One read behind the dashboard palette: every entity kind, capped at five
 * rows each so a keystroke does not scan a table.
 *
 * The per-group `limit` is a window, not the answer: each query fetches twenty
 * rows, the ranking runs over that window and only then is it cut to five. Five
 * rows straight from `name ASC` would drop a prefix match that sorts late.
 * The groups are then cut to thirty rows in total, so a keystroke returns a
 * bounded page whatever the query matched.
 *
 * Pages are not results — the nav list lives in the web app and is merged
 * client-side. There is no per-group total either: a group that reaches the
 * limit is the one the palette links to "Ver todos", which saves a count per
 * keystroke.
 */
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject, type PanelSearchOutput } from "@menuza/shared/tenant";
import { and, db, or } from "@menuza/db";
import { can } from "@menuza/orpc-server/auth";
import { effectiveCouponStatus } from "./coupon-summary.ts";
import { rankPanelSearchItems } from "./search-rank.ts";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.search,
).$context<RequestHeadersHandlerPluginContext>();

const GROUP_LIMIT = 5;

const WINDOW_LIMIT = 20;

const TOTAL_LIMIT = 30;

/** `%`/`_` are wildcards in `ILIKE`; a literal search must escape them. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

export const searchImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);
  const canWrite = can(store.role, "catalog:write");
  const pattern = likePattern(input.q);
  const now = new Date();
  const base = `/dashboard/${store.tenantSlug}`;

  const [products, coupons, customers, tags, categories, departments, badges, subcategories] =
    await inTenantScope(store.tenantId, async () =>
      Promise.all([
        db.orm.public.Product.where({ tenantId: store.tenantId })
          .where((product) => product.name.ilike(pattern))
          .select("id", "name", "available")
          .orderBy((product) => product.name.asc())
          .limit(WINDOW_LIMIT)
          .all(),
        db.orm.public.Coupon.where((coupon) =>
          and(coupon.tenantId.eq(store.tenantId), coupon.deletedAt.eq(null)),
        )
          .where((coupon) => coupon.code.ilike(pattern))
          .orderBy((coupon) => coupon.code.asc())
          .limit(WINDOW_LIMIT)
          .all(),
        db.orm.public.Customer.where({ tenantId: store.tenantId })
          .where((customer) => or(customer.name.ilike(pattern), customer.email.ilike(pattern)))
          .select("id", "name", "email")
          .orderBy((customer) => customer.name.asc())
          .limit(WINDOW_LIMIT)
          .all(),
        db.orm.public.Tag.where({ tenantId: store.tenantId })
          .where((tag) => tag.name.ilike(pattern))
          .select("id", "name", "isActive")
          .orderBy((tag) => tag.name.asc())
          .limit(WINDOW_LIMIT)
          .all(),
        db.orm.public.Category.where({ tenantId: store.tenantId })
          .where((category) => category.name.ilike(pattern))
          .select("id", "name")
          .orderBy((category) => category.name.asc())
          .limit(WINDOW_LIMIT)
          .all(),
        db.orm.public.Department.where({ tenantId: store.tenantId })
          .where((department) => department.name.ilike(pattern))
          .select("id", "name", "active")
          .orderBy((department) => department.name.asc())
          .limit(WINDOW_LIMIT)
          .all(),
        db.orm.public.Badge.where({ tenantId: store.tenantId })
          .where((badge) => badge.name.ilike(pattern))
          .select("id", "name", "isActive")
          .orderBy((badge) => badge.name.asc())
          .limit(WINDOW_LIMIT)
          .all(),
        db.orm.public.Subcategory.where({ tenantId: store.tenantId })
          .where((subcategory) => subcategory.name.ilike(pattern))
          .select("id", "name")
          .orderBy((subcategory) => subcategory.name.asc())
          .limit(WINDOW_LIMIT)
          .all(),
      ]),
    );

  const groups: PanelSearchOutput["groups"] = [
    {
      kind: "product",
      items: rankPanelSearchItems(
        products.map((product) => ({
          kind: "product" as const,
          id: product.id,
          label: product.name,
          status: product.available ? "available" : "unavailable",
          href: `${base}/catalog/products/${product.id}`,
        })),
        input.q,
      ).slice(0, GROUP_LIMIT),
    },
    {
      kind: "coupon",
      items: rankPanelSearchItems(
        coupons.map((coupon) => ({
          kind: "coupon" as const,
          id: coupon.id,
          label: coupon.code,
          sublabel: coupon.description ?? undefined,
          status: effectiveCouponStatus(coupon, now),
          href: `${base}/coupons/${coupon.id}`,
        })),
        input.q,
      ).slice(0, GROUP_LIMIT),
    },
    {
      kind: "customer",
      items: rankPanelSearchItems(
        customers.map((customer) => ({
          kind: "customer" as const,
          id: customer.id,
          label: customer.name,
          sublabel: customer.email,
          href: `${base}/customers/${customer.id}`,
        })),
        input.q,
      ).slice(0, GROUP_LIMIT),
    },
    {
      kind: "tag",
      items: rankPanelSearchItems(
        tags.map((tag) => ({
          kind: "tag" as const,
          id: tag.id,
          label: tag.name,
          status: tag.isActive ? "active" : "disabled",
          href: `${base}/catalog/tags`,
        })),
        input.q,
      ).slice(0, GROUP_LIMIT),
    },
    {
      kind: "category",
      items: rankPanelSearchItems(
        categories.map((category) => ({
          kind: "category" as const,
          id: category.id,
          label: category.name,
          href: `${base}/catalog/categories?q=${encodeURIComponent(category.name)}`,
        })),
        input.q,
      ).slice(0, GROUP_LIMIT),
    },
    {
      kind: "department",
      items: rankPanelSearchItems(
        departments.map((department) => ({
          kind: "department" as const,
          id: department.id,
          label: department.name,
          status: department.active ? "active" : "disabled",
          href: `${base}/catalog/departments?q=${encodeURIComponent(department.name)}`,
        })),
        input.q,
      ).slice(0, GROUP_LIMIT),
    },
    {
      kind: "badge",
      items: rankPanelSearchItems(
        badges.map((badge) => ({
          kind: "badge" as const,
          id: badge.id,
          label: badge.name,
          status: badge.isActive ? "active" : "disabled",
          href: `${base}/catalog/badges`,
        })),
        input.q,
      ).slice(0, GROUP_LIMIT),
    },
    {
      kind: "subcategory",
      items: rankPanelSearchItems(
        subcategories.map((subcategory) => ({
          kind: "subcategory" as const,
          id: subcategory.id,
          label: subcategory.name,
          href: `${base}/catalog/subcategories?q=${encodeURIComponent(subcategory.name)}`,
        })),
        input.q,
      ).slice(0, GROUP_LIMIT),
    },
  ];

  // D5 asks for roughly thirty results in the palette, so the groups are cut in
  // their fixed order and a group left with no room is dropped rather than
  // emitted empty.
  let remaining = TOTAL_LIMIT;
  const capped: PanelSearchOutput["groups"] = [];

  for (const group of groups) {
    if (remaining === 0) break;

    const items = group.items.slice(0, remaining);

    if (items.length === 0) continue;

    remaining -= items.length;
    capped.push({ kind: group.kind, items });
  }

  return { canWrite, groups: capped };
});

export type SearchImpl = typeof searchImpl;
