"use client";

/**
 * Publishes the loaded coupon's code so the shell's breadcrumb reads `PROMO10`
 * instead of a UUID. Only the label crosses to the client.
 */
import type { ReactNode } from "react";
import { usePublishCrumbLabel } from "../../_components/crumb-labels.tsx";

export function CouponCrumb({
  couponId,
  code,
  children,
}: {
  couponId: string;
  code: string;
  children: ReactNode;
}) {
  usePublishCrumbLabel(couponId, code);

  return <>{children}</>;
}
