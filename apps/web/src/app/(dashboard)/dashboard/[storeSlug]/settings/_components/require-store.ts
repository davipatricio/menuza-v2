import { notFound, redirect } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";

/**
 * Resolves the store for a settings page. Settings has no model of its own yet
 * (MEN-225 leftovers), so the page needs the store's display name and nothing
 * more: `panel.getStore` is still the authority for "may this member be here".
 */
export async function requireStore(
  storeSlug: string,
): Promise<{ slug: string; displayName: string }> {
  const client = await panelClient();

  if (!client) redirect("/dashboard/login");

  try {
    const store = await client.panel.getStore({ storeSlug });

    return { slug: store.tenantSlug, displayName: store.tenantName };
  } catch {
    notFound();
  }
}
