import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import type { CSSProperties } from "react";
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

/**
 * The palette arrives resolved from the API: the store's three colors, the ink
 * contrast picked for each surface and the base radius. Writing them as CSS
 * variables is what makes the same components paint every store differently
 * without a per-store stylesheet.
 */
function StorefrontLayout() {
  const { store } = Route.useLoaderData();
  const { theme } = store;

  // SAFETY: CSS custom properties are legal style values, but React's
  // `CSSProperties` only types the camelCased standard set.
  const palette = {
    "--background": theme.backgroundColor,
    "--foreground": theme.foregroundColor,
    "--card": theme.backgroundColor,
    "--card-foreground": theme.foregroundColor,
    "--primary": theme.primaryColor,
    "--primary-foreground": theme.primaryForeground,
    "--accent": theme.accentColor,
    "--accent-foreground": theme.foregroundColor,
    "--radius": `${theme.radius}px`,
  } as CSSProperties;

  return (
    <div className="min-h-dvh bg-background text-foreground" style={palette}>
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 md:py-8">
        <StoreHeader />
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
