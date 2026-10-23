"use client";

/**
 * Publishes the loaded product's name so the shell's breadcrumb can render it
 * instead of the raw id. The product came from the API on the server; only the
 * label crosses to the client.
 */
import type { ReactNode } from "react";
import { usePublishCrumbLabel } from "../../../_components/crumb-labels.tsx";

export function ProductCrumb({
  productId,
  name,
  children,
}: {
  productId: string;
  name: string;
  children: ReactNode;
}) {
  usePublishCrumbLabel(productId, name);

  return <>{children}</>;
}
