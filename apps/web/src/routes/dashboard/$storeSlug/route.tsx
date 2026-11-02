import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/lib/require-session.ts";
import { StoreShell } from "@/features/shell/components/store-shell.tsx";
import { getStoreFn } from "@/features/shell/server/store.functions.ts";

export const Route = createFileRoute("/dashboard/$storeSlug")({
  beforeLoad: async ({ location }) => ({ session: await requireSession(location.href) }),
  loader: async ({ params, context }) => {
    // `beforeLoad` already resolved the session, so calling `getSessionFn` here would be the
    // duplicate read the architecture forbids.
    const store = await getStoreFn({ data: { storeSlug: params.storeSlug } });

    if (!store) throw notFound();

    return { store, session: context.session };
  },
  component: StoreLayout,
});

function StoreLayout() {
  const { store, session } = Route.useLoaderData();

  return (
    <StoreShell store={store} session={session}>
      <Outlet />
    </StoreShell>
  );
}
