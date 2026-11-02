/**
 * Signed-in guard for the dashboard layouts.
 *
 * `beforeLoad` is navigation UX only: the tenant API revalidates the session on
 * every call, so this only spares an anonymous visitor a page that would render
 * empty — it is never what keeps another tenant's data out.
 */
import { redirect } from "@tanstack/react-router";
import type { PanelSession } from "@/features/auth/server/session-client.ts";
import { getSessionStateFn } from "@/features/shell/server/store.functions.ts";

/**
 * The current session, or a redirect to login carrying `href` (the current
 * `location.href`) as its `returnTo` search param.
 */
export async function requireSession(href: string): Promise<PanelSession> {
  let state = await getSessionStateFn();

  // One retry absorbs a restarting tenant API before we treat it as an outage.
  if (state.status === "unavailable") {
    await new Promise((resolve) => setTimeout(resolve, 250));
    state = await getSessionStateFn();
  }

  if (state.status === "ok") return state.session;

  if (state.status === "unauthenticated") {
    throw redirect({ to: "/dashboard/login", search: { returnTo: href } });
  }

  // The API could not answer: surface a retryable error instead of signing out.
  throw new Error("Não foi possível verificar sua sessão. Tente novamente.");
}
