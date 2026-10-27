#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/2eb0ae28c0fd5fd3c1ceae928608fdb791fa42e99167e8492aaa95c5acd5accf/contract";
import startContract from "../../snapshots/2eb0ae28c0fd5fd3c1ceae928608fdb791fa42e99167e8492aaa95c5acd5accf/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/6df4e3bc494fdd54b25972c4c7ebe2158a749962f90f669f9ff266f7288c9eac/contract";
import endContract from "../../snapshots/6df4e3bc494fdd54b25972c4c7ebe2158a749962f90f669f9ff266f7288c9eac/contract.json" with { type: "json" };
import { Migration, MigrationCLI, sql } from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addCheckConstraint({
        schema: "public",
        table: "Coupon",
        constraint: "coupon_maximum_discount_non_negative_7254daa1",
        expression: sql`"maximumDiscountCents" IS NULL OR "maximumDiscountCents" >= 0`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Coupon",
        constraint: "coupon_minimum_order_non_negative_6ec4ce93",
        expression: sql`"minimumOrderCents" IS NULL OR "minimumOrderCents" >= 0`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Coupon",
        constraint: "coupon_per_customer_limit_positive_4fd252ba",
        expression: sql`"perCustomerLimit" IS NULL OR "perCustomerLimit" > 0`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Coupon",
        constraint: "coupon_percentage_within_hundred_77f17b3a",
        expression: sql`"discountType" <> 'percentage' OR "value" <= 100`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Coupon",
        constraint: "coupon_shipping_discount_within_hundred_9f202eae",
        expression: sql`"shippingDiscountPercent" IS NULL OR ("shippingDiscountPercent" >= 0 AND "shippingDiscountPercent" <= 100)`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Coupon",
        constraint: "coupon_usage_limit_positive_443593df",
        expression: sql`"usageLimit" IS NULL OR "usageLimit" > 0`,
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Coupon",
        constraint: "coupon_value_non_negative_95f49512",
        expression: sql`"value" >= 0`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
