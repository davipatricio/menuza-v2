# src/components

Component-layer rules for `apps/web`. The app-level contract is
[`apps/web/AGENTS.md`](../../AGENTS.md); the dashboard visual system is
[`apps/web/DESIGN.md`](../../DESIGN.md).

## Primitive layer

- `@base-ui/react` is the only primitive library. **No Radix.** A registry block that imports
  `@radix-ui/*` is rejected or ported, not installed.
- `src/components/ui/` holds the `base-nova` shadcn set plus local additions (`data-table`,
  `empty`, `spinner`, `theme-toggle`).
- Vendored third-party blocks live in their own folder: `src/components/ecomcn/`,
  `src/components/reui/`, `src/components/smoothui/`, and
  `src/components/ui/{aceternity,cult-ui,magicui,motion-primitives}/`. Keep that shape for new
  vendors.

### Already installed — do not re-add

`accordion`, `alert`, `alert-dialog`, `avatar`, `badge`, `breadcrumb`, `button`, `button-group`,
`calendar`, `card`, `carousel`, `checkbox`, `collapsible`, `combobox`, `context-menu`, `data-table`,
`dialog`, `dropdown-menu`, `empty`, `field`, `input`, `input-group`, `label`, `popover`,
`radio-group`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`,
`spinner`, `switch`, `table`, `tabs`, `textarea`, `theme-toggle`, `toggle`, `toggle-group`,
`tooltip`.

A registry item that names one of these in `registryDependencies` resolves against the local file.
That is the expected behaviour — do not delete and re-install the local version to "match" the
registry.

## Registry namespaces

`apps/web/components.json` registers seven: `@reui`, `@smoothui`, `@magicui`, `@motion-primitives`,
`@cult-ui`, `@aceternity`, `@ecomcn`. Catalog, free tiers and per-surface routing:
[`docs/ui/component-catalog.md`](../../../../docs/ui/component-catalog.md).

Workflow:

```bash
cd apps/web
bunx shadcn view @reui/c-data-grid-1        # 200 free · 401 paywalled · 404 wrong name
bunx shadcn add @reui/c-data-grid-1 --dry-run
bunx shadcn add @magicui/marquee --path src/components/ui/magicui
```

- `@reui` resolves `{style}` to `base-nova`. Its in-house primitives land in
  `src/components/reui/` (`<name>.tsx` or `<name>/`), hooks in `src/hooks/`; its 1,264 `c-*`
  examples are demos and default to `src/components/examples/`. Read those with `view` — do not
  install them in bulk.
- `@smoothui` and `@ecomcn` bring their own folders (`smoothui/<name>/`, `ecomcn/<name>.tsx`).
- `@magicui`, `@cult-ui`, `@motion-primitives` and `@aceternity` declare their own targets or none
  at all. They are kept under `src/components/ui/<vendor>/` with `--path`.
- The free tier is per item. Confirm with `view` before planning around a block.
- **Check the dependency list of any block before adding it.** Blocks can drag dependencies that
  break repo policy: stock `dashboard-01` declares `zod` (banned — Valibot only),
  `recharts@3.8.0` and `@dnd-kit/*`. `view` prints `dependencies` and `registryDependencies`.

### Installed

All seven namespaces are installed; counts and exact paths are in the catalog's
[Installed](../../../../docs/ui/component-catalog.md#installed) table. Nothing is imported by a
route yet.

Skipped on purpose: `@smoothui/command` and ReUI `c-command-*` (`cmdk` → Radix),
`@cult-ui/gradient-heading` (Radix Slot), `@cult-ui/onboarding` / `wizard-expandable` (Radix
controllable state), `@cult-ui/halo-toast` (`sonner`), `@magicui/file-tree` (duplicate of the
SmoothUI headless tree). Port them off the banned dependency before adding them.

Vendored trees keep upstream behaviour. `.oxlintrc.json` turns off the React Compiler diagnostics
(`react/refs`, `react/purity`, `react/immutability`, `react/set-state-in-effect`),
`react-hooks/exhaustive-deps` and most `anti-slop/*` rules for `reui/`, `smoothui/` and
`ui/{motion-primitives,magicui,aceternity,cult-ui}/`. Accessibility and correctness rules stay on.

## Overlays

`ui/dialog.tsx` (Base UI `Dialog`) is the modal shell. Registry "dialogs" that roll their own
portal and skip the focus trap — `@motion-primitives` `dialog` and `morphing-dialog` — are
animation references, not replacements.

For nested dialogs, Base UI needs `Dialog.Viewport` to expose `data-nested`,
`data-nested-dialog-open` and `--nested-dialogs`. The current `DialogContent` renders
`Portal → Backdrop + Popup` with no Viewport, so those hooks are absent. Also note that the overlay
and the popup are both `z-50`; a dialog opened from inside a `Sheet` (also `z-50`) needs an explicit
layer policy. Neither is changed yet.

## Styling

- Semantic tokens only (`bg-background`, `text-muted-foreground`, `border-border`, …). Registry
  blocks that hard-code `slate-*` / `zinc-*` need remapping before they ship.
- Spacing uses `gap-*`, not `space-*`. Overlays always carry a `Title`.
- Dashboard work follows `DESIGN.md` and ends with `bun run design:check` from the repo root.

## Accessibility

- A `Checkbox` outside `src/components/ui/**` needs `Field orientation="horizontal"` +
  `Checkbox id={field.name}` + `FieldLabel htmlFor={field.name}`. Base UI renders a `<button>`, so a
  wrapping `<label>` trips `jsx-a11y/label-has-associated-control`.
- `Button render={<Link … />}` puts `aria-label` on the `Link`, not the `Button` — the rendered
  element is what `jsx-a11y/control-has-associated-label` reads.
- Registry animations must respect `prefers-reduced-motion`; `globals.css` already guards the view
  transitions.

## Known gap

The overlay animation classes (`animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`,
`animate-out`) come from `tw-animate-css`, which is not a dependency and not imported in
`globals.css`. Tailwind 4.3.3 does not provide them, so those overlays currently animate with
nothing. Do not add more of those classes until the import exists.

## Checks

Format and lint the paths you touched, never a package-wide pass:

```bash
bunx oxfmt <paths>
bunx oxlint <paths>
```
