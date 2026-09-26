import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { ROLE_LABELS } from "@/lib/panel-labels.ts";
import { panelClient, type TenantClient } from "@/lib/server-tenant.ts";
import { AppSidebar } from "./_components/app-sidebar.tsx";
import { HeaderActions } from "../_components/header-actions.tsx";
import { StoreBreadcrumb } from "./_components/store-breadcrumb.tsx";

// The shell resolves the store from the session on every request, so it blocks
// on the server instead of prerendering a shell for a fixed set of slugs.
export const instant = false;

/**
 * The store's own data, or `null` when the caller may not be here.
 *
 * An unknown slug and a non-member are both `NOT_FOUND` from the API, and both
 * are the same thing to this page: a 404. Keeping the fetch separate from the
 * render also keeps `notFound()` out of a `catch` that wraps markup.
 */
async function loadStore(client: TenantClient, storeSlug: string) {
  try {
    const [store, session] = await Promise.all([
      client.panel.getStore({ storeSlug }),
      client.session.current(),
    ]);

    return { store, session };
  } catch {
    return null;
  }
}

/**
 * Store shell. `panel.getStore` is the single authority for "may this member
 * open this store", so there is no `generateStaticParams` and no client-side
 * guess: the slug comes from the URL and the API decides.
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) redirect("/dashboard/login");

  const loaded = await loadStore(client, storeSlug);

  if (!loaded) notFound();

  const { store, session } = loaded;
  const basePath = `/dashboard/${store.tenantSlug}`;
  const memberName = store.member.name ?? store.member.email;

  const stores = session.memberships.map((membership) => ({
    slug: membership.tenantSlug,
    displayName: membership.tenantName,
    roleLabel: ROLE_LABELS[membership.role],
  }));

  return (
    <SidebarProvider>
      <AppSidebar
        basePath={basePath}
        storeName={store.tenantName}
        currentSlug={store.tenantSlug}
        stores={stores}
        currentRole={ROLE_LABELS[store.role]}
        userName={memberName}
        role={ROLE_LABELS[store.role]}
      />
      <SidebarInset>
        <h1 className="sr-only">{store.tenantName}</h1>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger aria-label="Alternar navegação" className="shrink-0" />
          <Suspense
            fallback={
              <span className="min-w-0 flex-1 truncate text-sm font-medium">Dashboard</span>
            }
          >
            <StoreBreadcrumb basePath={basePath} />
          </Suspense>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-2.5 pl-2 text-xs font-medium text-muted-foreground sm:flex">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              <span>{memberName}</span>
              <span aria-hidden="true" className="text-border">
                |
              </span>
              <span className="text-foreground">{ROLE_LABELS[store.role]}</span>
            </span>
            <HeaderActions />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
