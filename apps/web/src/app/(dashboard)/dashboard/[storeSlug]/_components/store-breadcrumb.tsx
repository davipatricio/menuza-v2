"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb.tsx";
import { MOCK_STORES, getStoreCustomerById } from "@/lib/mock-dashboard-data.ts";

const SEGMENT_LABELS = {
  orders: "Pedidos",
  catalog: "Catálogo",
  customers: "Clientes",
  coupons: "Cupons",
  audit: "Auditoria",
  settings: "Configurações",
  store: "Loja",
  delivery: "Entrega",
  payments: "Pagamentos",
  notifications: "Notificações",
  team: "Equipe",
};

interface Crumb {
  label: string;
  href: string;
}

/**
 * Section trail: Dashboard > Seção > Página.
 * The Dashboard root is static text, never a link. Full trail on
 * desktop; current page only on mobile to avoid overflow.
 *
 * Only `li` elements are direct children of the `ol` (via BreadcrumbList):
 * separators are decorative spans so list semantics stay valid.
 */
export function StoreBreadcrumb({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const relative = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : "";
  const segments = relative.split("/").filter(Boolean);
  const store = MOCK_STORES.find((entry) => basePath.endsWith(`/${entry.slug}`));

  const crumbs: Crumb[] = [];
  let href = basePath;
  let parent = "";

  for (const segment of segments) {
    href += `/${segment}`;

    // SAFETY: `Object.hasOwn` narrows the key to the label map's own keys.
    const known = Object.hasOwn(SEGMENT_LABELS, segment)
      ? SEGMENT_LABELS[segment as keyof typeof SEGMENT_LABELS]
      : undefined;

    // Detail segments (`customers/3`, `orders/ORD-101`) read as the entity,
    // not as a bare id, so the trail stays usable.
    const label =
      known ??
      (parent === "customers" && store
        ? (getStoreCustomerById(store.slug, segment)?.name ?? segment)
        : segment);

    crumbs.push({ label, href });
    parent = segment;
  }

  const current = crumbs.at(-1)?.label ?? "Dashboard";

  return (
    <>
      <Breadcrumb className="hidden min-w-0 flex-1 md:block">
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          <BreadcrumbItem className="shrink-0">
            {crumbs.length === 0 ? (
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            ) : (
              <span>Dashboard</span>
            )}
          </BreadcrumbItem>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;

            return (
              <Fragment key={crumb.href}>
                <span aria-hidden="true" className="flex shrink-0 items-center [&>svg]:size-3.5">
                  <ChevronRight />
                </span>
                <BreadcrumbItem className="min-w-0">
                  {last ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      render={<Link href={crumb.href}>{crumb.label}</Link>}
                      className="truncate"
                    />
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <span className="min-w-0 flex-1 truncate text-sm font-medium md:hidden">{current}</span>
    </>
  );
}
