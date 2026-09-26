import { saveOnboardingImpl } from "./saveOnboarding.impl.ts";

export const profileSubdomainRouter = {
  saveOnboarding: saveOnboardingImpl,
};

export type ProfileSubdomainRouter = typeof profileSubdomainRouter;
