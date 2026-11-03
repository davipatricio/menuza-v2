/**
 * Browser-side staff session client, re-exported for the auth and shell islands.
 *
 * The implementation lives in `@/lib/session-client.ts`; this module is only the
 * path those components import. Client only: it must not import `src/server/**`,
 * or the browser bundle would pull in the server module graph.
 */
export {
  changePassword,
  createStore,
  loginSession,
  logoutSession,
  registerAccount,
  revokeOtherSessions,
  revokeSession,
  saveOnboarding,
  type PanelSession,
} from "@/lib/session-client.ts";
