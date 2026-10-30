import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { and, db, or } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { redemptionAggregates, toCouponSummary, usageSeries } from "./coupon-summary.ts";
import { toPanelTimestamp } from "./format.ts";
import { inTenantScope, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.getCouponDetail,
).$context<RequestHeadersHandlerPluginContext>();

const DEFAULT_PAGE_SIZE = 20;

/** `%`/`_` are wildcards in `ILIKE`; a literal search must escape them. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/**
 * One coupon with a page of its redemption history, its usage series and the
 * aggregates the performance tab reads.
 *
 * The history is a paged, searched SQL read: the table shows one page, and the
 * search box narrows the rows in the database instead of shipping all of them
 * and filtering in the browser. Totals and the chart come from aggregate queries
 * so the page size never changes what the KPIs say.
 */
export const getCouponDetailImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);
  const now = new Date();

  const coupon = await inTenantScope(store.tenantId, () =>
    db.orm.public.Coupon.where({ tenantId: store.tenantId, id: input.couponId }).first(),
  );

  if (!coupon) throw notFound();

  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = input.page ?? 1;
  const search = input.search?.trim() ?? "";
  const sort = input.sort ?? "recent";
  const like = likePattern(search);

  // Relation fields are orderable but not filterable in a `where` predicate, so
  // the search resolves the matching customers and orders first and then
  // narrows the redemptions by id. Empty in both lists means the search matched
  // nothing — the coupon still loads, its history is just an empty page.
  const [customerIds, orderIds] =
    search === ""
      ? [[], []]
      : await inTenantScope(store.tenantId, () =>
          Promise.all([
            db.orm.public.Customer.where((customer) =>
              and(
                customer.tenantId.eq(store.tenantId),
                or(customer.name.ilike(like), customer.email.ilike(like)),
              ),
            )
              .all()
              .then((rows) => rows.map((row) => row.id)),
            db.orm.public.Order.where((order) =>
              and(order.tenantId.eq(store.tenantId), order.code.ilike(like)),
            )
              .all()
              .then((rows) => rows.map((row) => row.id)),
          ]),
        );

  const searchMatchedNothing = search !== "" && customerIds.length === 0 && orderIds.length === 0;

  const [redemptions, redemptionsTotal, usageBuckets, orders] = await inTenantScope(
    store.tenantId,
    () =>
      Promise.all([
        db.orm.public.CouponRedemption.where((redemption) => {
          const conditions = [
            redemption.tenantId.eq(store.tenantId),
            redemption.couponId.eq(input.couponId),
          ];

          if (searchMatchedNothing) {
            conditions.push(redemption.customerId.in([]));
          } else if (search !== "") {
            const matches = [];

            if (customerIds.length > 0) matches.push(redemption.customerId.in(customerIds));

            if (orderIds.length > 0) matches.push(redemption.orderId.in(orderIds));
            conditions.push(or(...matches));
          }

          return and(...conditions);
        })
          .include("customer", (customer) => customer.select("id", "name", "email"))
          .include("order", (order) => order.select("id", "code", "totalCents", "createdAt"))
          .orderBy(
            sort === "oldest"
              ? [(redemption) => redemption.createdAt.asc()]
              : sort === "discount"
                ? [
                    (redemption) => redemption.discountCents.desc(),
                    (redemption) => redemption.createdAt.desc(),
                  ]
                : [(redemption) => redemption.createdAt.desc()],
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all(),
        db.orm.public.CouponRedemption.where((redemption) => {
          const conditions = [
            redemption.tenantId.eq(store.tenantId),
            redemption.couponId.eq(input.couponId),
          ];

          if (searchMatchedNothing) {
            conditions.push(redemption.customerId.in([]));
          } else if (search !== "") {
            const matches = [];

            if (customerIds.length > 0) matches.push(redemption.customerId.in(customerIds));

            if (orderIds.length > 0) matches.push(redemption.orderId.in(orderIds));
            conditions.push(or(...matches));
          }

          return and(...conditions);
        })
          .aggregate((aggregate) => ({ count: aggregate.count() }))
          .then((row) => row.count),
        // The chart is per day across the coupon's whole life, so it groups the
        // timestamps in SQL and folds them by day here; the page does not bound it.
        db.orm.public.CouponRedemption.where({
          tenantId: store.tenantId,
          couponId: input.couponId,
        })
          .groupBy("createdAt")
          .aggregate((aggregate) => ({
            redemptions: aggregate.count(),
            discountCents: aggregate.sum("discountCents"),
          })),
        // Order totals are the only column the redemption row does not carry, so
        // they are read narrow: two fields per redemption, none of the joins.
        db.orm.public.CouponRedemption.where({
          tenantId: store.tenantId,
          couponId: input.couponId,
        })
          .include("order", (order) => order.select("totalCents"))
          .all(),
      ]),
  );

  const history = redemptions.map((row) => {
    // Both relations are NOT NULL FKs (`onDelete: Cascade`), so the eager load
    // always resolves. Prisma still types them as nullable, so the check lives
    // here rather than at every field.
    const { customer, order } = row;

    if (!customer || !order) {
      throw new Error(`Coupon redemption ${row.id} lost its customer or order`);
    }

    return {
      id: row.id,
      discountCents: row.discountCents,
      createdAt: toPanelTimestamp(row.createdAt),
      customer: { id: customer.id, name: customer.name, email: customer.email },
      order: {
        id: order.id,
        code: order.code,
        totalCents: order.totalCents,
        createdAt: toPanelTimestamp(order.createdAt),
      },
    };
  });

  const ordersWithCouponCents = orders.reduce(
    (total, row) => total + (row.order?.totalCents ?? 0),
    0,
  );

  // The aggregates cover every redemption of the coupon, not the page: the KPI
  // cards must not shrink when the member pages through the history.
  const aggregate = (await redemptionAggregates(store.tenantId, [input.couponId])).get(
    input.couponId,
  );

  return {
    coupon: toCouponSummary(coupon, aggregate, now),
    redemptions: history,
    redemptionsTotal,
    usage: usageSeries(usageBuckets),
    ordersWithCouponCents,
  };
});

export type GetCouponDetailImpl = typeof getCouponDetailImpl;
