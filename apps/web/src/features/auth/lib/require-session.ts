/**
 * Signed-in guard for the dashboard layouts.
 *
 * `beforeLoad` is navigation UX only: the tenant API revalidates the session on
 * every call, so this only spares an anonymous visitor a page that would render
 * empty — it is never what keeps another tenant's data out.
 */
import { redirect } from "@tanstack/react-router";
import type { PanelSession } from "@/features/auth/server/session-client.ts";
import { getSessionFn } from "@/features/shell/server/store.functions.ts";

/**
 * The current session, or a redirect to login carrying `href` (the current
 * `location.href`) as its `returnTo` search param.
 */
export async function requireSession(href: string): Promise<PanelSession> {
  const session = await getSessionFn().catch(() => null);

  if (!session) throw redirect({ to: "/dashboard/login", search: { returnTo: href } });

  return session;
}
