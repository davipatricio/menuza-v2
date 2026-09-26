"use client";

/**
 * Publishes the loaded customer's name so the shell's breadcrumb can render it
 * instead of a raw id. The row came from the API on the server; only the label
 * crosses to the client.
 */
import type { ReactNode } from "react";
import { CrumbLabelsContext } from "../../_components/crumb-labels.tsx";

export function CustomerCrumb({
  customerId,
  name,
  children,
}: {
  customerId: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <CrumbLabelsContext.Provider value={{ [customerId]: name }} key={customerId}>
      {children}
    </CrumbLabelsContext.Provider>
  );
}
