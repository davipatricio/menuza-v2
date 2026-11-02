import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/settings` has no screen of its own: the first tab is the store data form.
 * Redirecting in `beforeLoad` keeps the URL honest instead of rendering a
 * second, empty outlet.
 */
export const Route = createFileRoute("/dashboard/$storeSlug/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/$storeSlug/settings/store",
      params: { storeSlug: params.storeSlug },
    });
  },
});
