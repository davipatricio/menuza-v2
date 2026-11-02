import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Marketing layout. Every marketing page is static by construction: this
 * layout has no loader, no `beforeLoad` and reads no request data, so Start
 * serves the route from the prerendered shell. Next's `ensureStatic` build
 * guard has no Start equivalent, so the rule lives here as a comment and in
 * `features/marketing/AGENTS.md`.
 */
export const Route = createFileRoute("/_marketing")({
  component: Outlet,
});
