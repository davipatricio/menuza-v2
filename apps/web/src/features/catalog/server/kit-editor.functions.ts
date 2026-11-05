/**
 * Reads behind the kit editor: the kit itself and the product/variation options
 * a dish picks from. Both answer `null` when there is no dashboard session, the
 * same signal the other catalog reads use for the login redirect.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import type { PanelKitDetail } from "@/lib/api/model/panelKitDetail.ts";
import type { PanelKitOptionsOutput } from "@/lib/api/model/panelKitOptionsOutput.ts";
import { panelClient } from "@/server/panel-client.ts";

export const getKitFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string(), kitId: v.string() }))
  .handler(async ({ data }): Promise<{ kit: PanelKitDetail } | null> => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.getKit(data);
  });

export const listKitOptionsFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }): Promise<PanelKitOptionsOutput | null> => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listKitOptions(data);
  });
