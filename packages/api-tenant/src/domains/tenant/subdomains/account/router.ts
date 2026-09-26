import { listSessionsImpl } from "./listSessions.impl.ts";
import { changePasswordImpl } from "./changePassword.impl.ts";
import { revokeSessionImpl } from "./revokeSession.impl.ts";
import { revokeOtherSessionsImpl } from "./revokeOtherSessions.impl.ts";

export const accountSubdomainRouter = {
  listSessions: listSessionsImpl,
  changePassword: changePasswordImpl,
  revokeSession: revokeSessionImpl,
  revokeOtherSessions: revokeOtherSessionsImpl,
};

export type AccountSubdomainRouter = typeof accountSubdomainRouter;
