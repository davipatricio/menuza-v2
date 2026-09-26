import { loginImpl } from "./login.impl.ts";
import { logoutImpl } from "./logout.impl.ts";
import { currentImpl } from "./current.impl.ts";
import { registerImpl } from "./register.impl.ts";

export const sessionSubdomainRouter = {
  login: loginImpl,
  logout: logoutImpl,
  current: currentImpl,
  register: registerImpl,
};

export type SessionSubdomainRouter = typeof sessionSubdomainRouter;
