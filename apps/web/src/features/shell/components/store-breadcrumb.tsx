/**
 * The dashboard breadcrumb: `Dashboard > <section> > <detail>`.
 *
 * The store is the context of every page here, so its slug is not repeated as a
 * crumb (it only appears as the current page on the store overview). Route
 * groups such as `catalog` are implementation detail and are skipped, and a
 * detail page publishes the row's name for its id segment so a UUID never
 * reaches the header. Until that name arrives the segment is omitted instead of
 * rendering a placeholder.
 */
import { Fragment } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
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

/** Route groups that structure the file tree but add nothing for the reader. */
const GROUP_SEGMENTS = new Set(["catalog"]);

function segmentLabel(segment: string, labels: Record<string, string>): string | null {
  // A detail page publishes the row's name for its id segment; while it has not
  // arrived the crumb is omitted rather than showing a raw id.
  if (labels[segment]) return labels[segment];

  if (UUID_LIKE.test(segment)) return null;

  return crumbLabel(segment);
}

type Crumb = { href: string; label: string };

export function StoreBreadcrumb({ store }: { store: PanelStore }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const labels = useCrumbLabels();
  const segments = pathname.split("/").filter(Boolean);
  // `segments[0]` is always "dashboard" (this component only renders under it).
  const storeBase = `/dashboard/${store.tenantSlug}`;
  const crumbs: Crumb[] = [];

  let href = storeBase;

  for (const segment of segments.slice(2)) {
    href += `/${segment}`;

    if (GROUP_SEGMENTS.has(segment)) continue;

    const label = segmentLabel(segment, labels);

    // Settings has no index route; its first page is the store form.
    if (label) {
      crumbs.push({ href: segment === "settings" ? `${storeBase}/settings/store` : href, label });
    }
  }

  function open(event: { preventDefault: () => void }, target: string) {
    event.preventDefault();
    void navigate({ href: target, resetScroll: false });
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/dashboard" onClick={(event) => open(event, "/dashboard")}>
            Dashboard
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {crumbs.length === 0 ? (
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate">{store.tenantName}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : (
          crumbs.map((crumb, index) => (
            <Fragment key={crumb.href}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {index === crumbs.length - 1 ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={crumb.href}
                    onClick={(event) => open(event, crumb.href)}
                    className="truncate"
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
