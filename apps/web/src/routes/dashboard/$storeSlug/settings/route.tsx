import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { loadSettingsStoreFn } from "@/features/settings/server/settings.functions.ts";

/**
 * Layout for every settings screen. It resolves the store once per navigation,
 * so each page gets the display name without its own `getStore` round trip.
 */
export const Route = createFileRoute("/dashboard/$storeSlug/settings")({
  loader: async ({ params }) => {
    const result = await loadSettingsStoreFn({ data: { storeSlug: params.storeSlug } });

    // No panel session: the dashboard layout already resolved the store, so the
    // recovery is signing in again, not a 404.
    if (result.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    if (result.status === "not-found") throw notFound();

    return { store: result.store };
  },
  component: Outlet,
});
