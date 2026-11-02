import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/lib/require-session.ts";

export const Route = createFileRoute("/dashboard/signup/_onboarding")({
  beforeLoad: async ({ location }) => ({ session: await requireSession(location.href) }),
  component: OnboardingLayout,
});

/** One signed-in guard for the onboarding steps; each step owns its own redirects. */
function OnboardingLayout() {
  return <Outlet />;
}
