# src/components

Shared presentational pieces. Product-domain components stay in
`src/features/<domain>/components`.

## Layout

- `ui/` — shadcn Base UI primitives (Button, Card, Field, Table, Dialog, Switch,
  Sidebar, Toggle, ThemeToggle…). Regenerate through shadcn, do not hand-fork.
- `error-boundary.tsx` — wired as `defaultErrorComponent`; reports to Sentry and
  renders the pt-BR recovery screen. It deliberately does not print the error.
- `not-found.tsx`, `pending.tsx` — `defaultNotFoundComponent` and
  `defaultPendingComponent`.
- `offline-listener.tsx` — mounted once in the root route; listens for
  `menuqueue-drain`, `menuza:conflict`, `menuza:session-expired`.
- `push-notifications-card.tsx` — settings notifications card.
- `theme-provider.tsx` — `next-themes` wrapper.
- `nutrition/`, `assistant-ui/` — vendored primitives.

## Invariants

- Components here never import `@/server/**` or the generated `@/lib/api/**`
  clients; every read and write goes through a `createServerFn`.
- Overlays always render a `Title`; icons are `aria-hidden` next to a label.
- Use semantic tokens (`bg-background`, `text-muted-foreground`), never raw
  palette classes.
- No `"use client"` — this is not Next.

## Verify

`bunx oxfmt apps/web/src/components && bunx oxlint apps/web/src/components && bun run --filter '@menuza/web' build`
