/**
 * The dashboard breadcrumb: `Dashboard > <section> > <detail>`.
 *
 * The store is the context of every page here, so its slug is not repeated as a
 * crumb (it only appears as the current page on the store overview). Route
 * groups such as `catalog` are implementation detail and are skipped, and a
 * detail page publishes the row's name for its id segment so a UUID never
 * reaches the header.
 */
import { Fragment } from "react";
import { useLocation } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";
import type { PanelStore } from "@/features/shell/server/store.functions.ts";
import { crumbLabel, useCrumbLabels } from "./crumb-labels.tsx";

const UUID_LIKE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i;

/** Route groups that structure the file tree but add nothing for the reader. */
const GROUP_SEGMENTS = new Set(["catalog"]);

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
  const trailing = segments.slice(2).filter((segment) => !GROUP_SEGMENTS.has(segment));

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
          trailing.map((segment, index) => (
            <Fragment key={`${segment}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
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
          ))
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
