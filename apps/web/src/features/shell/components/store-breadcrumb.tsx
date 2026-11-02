/**
 * The dashboard breadcrumb: one crumb per path segment under `/dashboard`.
 *
 * The slug segment renders the store's display name instead of the URL slug;
 * deeper segments use the pt-BR map in `crumb-labels.ts` and anything that looks
 * like an id collapses to `…` so a UUID never reaches the header.
 */
import { Fragment } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";
import type { PanelStore } from "@/features/shell/server/store.functions.ts";
import { crumbLabel, useCrumbLabels } from "./crumb-labels.tsx";

const UUID_LIKE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i;

function segmentLabel(segment: string, labels: Record<string, string>): string {
  // A detail page publishes the row's name for its id segment, so the crumb
  // reads the product's name instead of a UUID.
  return labels[segment] ?? (UUID_LIKE.test(segment) ? "…" : crumbLabel(segment));
}

export function StoreBreadcrumb({ store }: { store: PanelStore }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const labels = useCrumbLabels();
  const segments = pathname.split("/").filter(Boolean);
  // `segments[0]` is always "dashboard" (this component only renders under it).
  const trailing = segments.slice(2);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList>
        <BreadcrumbItem>
          <span className="flex items-center gap-2 text-muted-foreground">
            <LayoutDashboard aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </span>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {trailing.length === 0 ? (
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate">{store.tenantName}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <Link
                    to="/dashboard/$storeSlug"
                    params={{ storeSlug: store.tenantSlug }}
                    aria-label={store.tenantName}
                  />
                }
              >
                {store.tenantName}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {trailing.map((segment, index) => (
              <Fragment key={`${segment}-${index}`}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {index === trailing.length - 1 ? (
                    <BreadcrumbPage className="truncate">
                      {segmentLabel(segment, labels)}
                    </BreadcrumbPage>
                  ) : (
                    <span className="truncate text-muted-foreground">
                      {segmentLabel(segment, labels)}
                    </span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
