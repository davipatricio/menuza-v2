/**
 * Publishes the loaded customer's name so the shell's breadcrumb renders it
 * instead of the raw id. Only the label crosses to the client.
 */
import type { ReactNode } from "react";
import { usePublishCrumbLabel } from "@/features/shell/components/crumb-labels.tsx";

export function CustomerCrumb({
  customerId,
  name,
  children,
}: {
  customerId: string;
  name: string;
  children: ReactNode;
}) {
  usePublishCrumbLabel(customerId, name);

  return <>{children}</>;
}
