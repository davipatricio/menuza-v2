import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/signup")({
  component: SignupLayout,
});

/** Signup chrome only; the steps live under the `_onboarding` guard. */
function SignupLayout() {
  return <Outlet />;
}
