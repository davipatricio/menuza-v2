import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { StoreHeader } from "@/features/storefront/components/store-header.tsx";
import { loadStorefrontStoreFn } from "@/features/storefront/server/storefront.functions.ts";

/**
 * Storefront shell for every host that owns a store. The guard is the host
 * itself: `loadStorefrontStoreFn` returns `null` when the server-resolved
 * tenant header is empty, and an unknown host is a 404 rather than an empty
 * store.
 */
export const Route = createFileRoute("/_storefront")({
  loader: async () => {
    const store = await loadStorefrontStoreFn();

    if (!store) throw notFound();

    return { store };
  },
  component: StorefrontLayout,
});

function StorefrontLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 md:py-8">
      <StoreHeader />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
