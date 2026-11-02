import { createFileRoute, redirect } from "@tanstack/react-router";
import { StoreOverview } from "@/features/shell/components/store-overview.tsx";
import { loadOverviewFn } from "@/features/shell/server/overview.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/")({
  loader: async ({ params }) => {
    const overview = await loadOverviewFn({ data: { storeSlug: params.storeSlug } });

    // `loadOverviewFn` returns null only without a panel session (the layout already
    // resolved the store), so the correct recovery is signing in again, not a 404.
    if (!overview) throw redirect({ href: "/dashboard/login" });

    return { overview };
  },
  head: () => ({ meta: [{ title: pageTitle("Visão geral") }] }),
  component: StoreOverviewPage,
});

/** The store overview. The parent layout already resolved the store and session. */
function StoreOverviewPage() {
  const { storeSlug } = Route.useParams();
  const { overview } = Route.useLoaderData();

  return <StoreOverview storeSlug={storeSlug} overview={overview} />;
}
