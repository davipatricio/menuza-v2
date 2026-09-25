import { loginImpl } from "./login.impl.ts";
import { logoutImpl } from "./logout.impl.ts";
import { currentImpl } from "./current.impl.ts";

export const sessionSubdomainRouter = {
  login: loginImpl,
  logout: logoutImpl,
  current: currentImpl,
};

export type SessionSubdomainRouter = typeof sessionSubdomainRouter;
