/**
 * Server functions for the store overview.
 *
 * Mirrors `store.functions.ts`: the only module the overview route imports for
 * panel data, so `src/server/**` stays out of the router's isomorphic graph.
 */
import { createServerFn } from "@tanstack/react-start";
import { PanelOrdersInputSchema } from "@menuza/shared/tenant";
import { panelClient } from "@/server/panel-client.ts";

/**
 * The store's orders for the overview, or `null` when the caller has no panel
 * session. `apps/web` reads the same procedure (`panel.listOrders`) and renders
 * the newest five; the slice stays in the page.
 */
export const loadOverviewFn = createServerFn({ method: "GET" })
  .validator(PanelOrdersInputSchema)
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    try {
      return await client.panel.listOrders({ storeSlug: data.storeSlug });
    } catch {
      // A denied or unavailable read is the page's empty/redirect case, not a crash:
      // `getStoreFn` maps the same failures the same way.
      return null;
    }
  });

/** The overview payload the page renders, with `null` already ruled out. */
export type PanelOverview = NonNullable<Awaited<ReturnType<typeof loadOverviewFn>>>;
