import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { AppSidebar } from "./_components/app-sidebar.tsx";
import { StoreBreadcrumb } from "./_components/store-breadcrumb.tsx";
import { MOCK_STORES, getStore } from "@/lib/mock-dashboard-data.ts";

export function generateStaticParams() {
  return MOCK_STORES.map((store) => ({ storeSlug: store.slug }));
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = getStore(storeSlug);

  if (!store) notFound();

  const basePath = `/dashboard/${store.slug}`;

  return (
    <SidebarProvider>
      <AppSidebar basePath={basePath} storeName={store.displayName} currentSlug={store.slug} />
      <SidebarInset>
        <h1 className="sr-only">{store.displayName}</h1>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger aria-label="Alternar navegação" className="shrink-0" />
          <Suspense
            fallback={
              <span className="min-w-0 flex-1 truncate text-sm font-medium">Dashboard</span>
            }
          >
            <StoreBreadcrumb basePath={basePath} />
          </Suspense>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
