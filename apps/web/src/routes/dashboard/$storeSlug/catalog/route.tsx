import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CatalogError } from "@/features/catalog/components/catalog-error.tsx";
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";

/**
 * Layout for every catalog screen. It renders no markup of its own; it exists so
 * the pending and error states are declared once instead of per list route.
 */
export const Route = createFileRoute("/dashboard/$storeSlug/catalog")({
  component: Outlet,
  pendingComponent: () => <TableLoading label="Carregando catálogo" />,
  errorComponent: ({ reset }) => <CatalogError onRetry={reset} />,
});
