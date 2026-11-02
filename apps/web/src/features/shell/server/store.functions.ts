/**
 * Server functions for the dashboard shell.
 *
 * The only module routes and loaders import for shell data: it is the surface
 * that keeps `src/server/**` out of the router's isomorphic module graph.
 */
import { createServerFn } from "@tanstack/react-start";
import { GetStoreInputSchema } from "@menuza/shared/tenant";
import { getPanelSession, panelClient, type PanelSession } from "@/server/panel-client.ts";

/**
 * The store a slug resolves to, or `null` when the caller may not open it.
 *
 * An unknown slug and a non-member are both `NOT_FOUND` from the API and both
 * mean 404 to the shell, so a denied read is a value and not a throw. The route
 * decides between `notFound()` and the store picker.
 */
export const getStoreFn = createServerFn({ method: "GET" })
  .validator(GetStoreInputSchema)
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    try {
      return await client.panel.getStore({ storeSlug: data.storeSlug });
    } catch {
      return null;
    }
  });

/** The current request's panel session, or `null` when signed out. */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PanelSession | null> => getPanelSession(),
);

/** The store payload the shell renders, with `null` already ruled out. */
export type PanelStore = NonNullable<Awaited<ReturnType<typeof getStoreFn>>>;
