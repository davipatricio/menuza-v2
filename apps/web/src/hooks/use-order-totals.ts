import * as React from "react";

export interface OrderLine {
  id: string;
  unitPrice: number;
  quantity: number;
}

export interface OrderTotalsOptions {
  lines: OrderLine[];
  /** 0–1. Applied to the subtotal before shipping and tax. */
  discountRate?: number;
  /** Order value at which shipping becomes free. Omit to disable the meter. */
  freeShippingThreshold?: number;
  flatShipping?: number;
  /** 0–1. An estimate until a real address exists — say so in the UI. */
  taxRate?: number;
}

export interface OrderTotals {
  itemCount: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  /** Remaining spend to unlock free shipping, or 0 once unlocked. */
  toFreeShipping: number;
  freeShippingProgress: number;
}

/**
 * Kept out of the component on purpose: totals are the part of a cart that
 * actually needs unit tests, and the part every store tweaks.
 */
export function useOrderTotals({
  lines,
  discountRate = 0,
  freeShippingThreshold,
  flatShipping = 0,
  taxRate = 0,
}: OrderTotalsOptions): OrderTotals {
  return React.useMemo(() => {
    const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
    const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
    const discount = subtotal * discountRate;
    const afterDiscount = subtotal - discount;

    const qualifies = freeShippingThreshold !== undefined && afterDiscount >= freeShippingThreshold;
    const shipping = itemCount === 0 || qualifies ? 0 : flatShipping;
    const tax = afterDiscount * taxRate;

    return {
      itemCount,
      subtotal,
      discount,
      shipping,
      tax,
      total: afterDiscount + shipping + tax,
      toFreeShipping:
        freeShippingThreshold === undefined
          ? 0
          : Math.max(0, freeShippingThreshold - afterDiscount),
      freeShippingProgress:
        freeShippingThreshold === undefined
          ? 1
          : Math.min(1, afterDiscount / freeShippingThreshold),
    };
  }, [lines, discountRate, freeShippingThreshold, flatShipping, taxRate]);
}
