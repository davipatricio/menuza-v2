---
colors:
  canvas: oklch(0.985 0 0)
  ink: oklch(0.16 0 0)
  primary: oklch(0.21 0 0)
  on-primary: oklch(0.985 0 0)
  secondary: oklch(0.945 0 0)
  muted: oklch(0.94 0 0)
  muted-ink: oklch(0.44 0 0)
  accent: oklch(0.93 0 0)
  destructive: oklch(0.55 0.21 27.325)
  border: oklch(0.845 0 0)
  input: oklch(0.88 0 0)
  ring: oklch(0.62 0 0)
typography:
  sans: var(--font-inter), ui-sans-serif, system-ui
  mono: ui-monospace, monospace
rounded: 0.625rem
spacing: compact-admin
components: shadcn-base-nova
---

# Menuza Dashboard — DESIGN.md

Dense, neutral admin panel (`/dashboard`). Portuguese (pt-BR). shadcn on Base UI, Tailwind v4. No marketing theatrics: structure over decoration.

Source of truth for tokens is `src/app/globals.css`. This file pins the intent so agents stop inventing new ones.

## Foundations

### Color roles

| Role                   | Token                                    | Value (light)                                                 |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| Page floor             | `--background`                           | `oklch(0.985 0 0)`                                            |
| Body text              | `--foreground`                           | `oklch(0.16 0 0)`                                             |
| Card                   | `--card` / `--card-foreground`           | `oklch(1 0 0)` / ink                                          |
| Primary action         | `--primary` / `--primary-foreground`     | `oklch(0.21 0 0)` / `oklch(0.985 0 0)`                        |
| Secondary action       | `--secondary` / `--secondary-foreground` | `oklch(0.945 0 0)` / `oklch(0.21 0 0)`                        |
| Soft band / hover wash | `--muted` / `--accent`                   | `oklch(0.94 0 0)` / `oklch(0.93 0 0)`                         |
| Secondary text         | `--muted-foreground`                     | `oklch(0.44 0 0)`                                             |
| Hairline / input edge  | `--border` / `--input`                   | `oklch(0.845 0 0)` / `oklch(0.88 0 0)`                        |
| Focus                  | `--ring`                                 | `oklch(0.62 0 0)`                                             |
| Error                  | `--destructive`                          | `oklch(0.55 0.21 27.325)`                                     |
| Sidebar                | `--sidebar-*`                            | white surface, same ink, `--sidebar-border: oklch(0.865 0 0)` |

`.dark` inverts the ramp (see `globals.css`). Never author `dark:` color overrides in components — semantic tokens already switch.

Contrast targets: body text ≥ 7:1, secondary text ≥ 4.5:1 on its surface.

### Type

- Family: Inter (`--font-inter` → `--font-sans`), antialiased, `optimizeLegibility`. No display serif in the panel.
- Scale: page `h2` = `text-xl font-semibold tracking-tight`; section description = `text-sm text-pretty text-muted-foreground`; table/body = `text-sm`; meta = `text-xs text-muted-foreground`. Money and codes use `tabular-nums`.
- Never set raw `font-bold` on cards to fake hierarchy. Use the scale above.

### Radius, elevation, density

- `--radius: 0.625rem`. Multipliers in `@theme inline` (`sm ×0.6`, `md ×0.8`, `lg ×1`, `xl ×1.4`). Buttons/inputs/selects = `rounded-lg`, cards/dialogs = `rounded-xl`, badges = `rounded-4xl`.
- Elevation is hairline + small shadow only: `--surface-shadow` and `--surface-shadow-hover`. No new shadow tiers, no colored shadows.
- Density is compact: controls default to `h-8` (see "Control heights" below). Content gutter is `p-4 md:p-8`, section stack is `gap-6`, form stack is `gap-4`.

### Motion (micro only)

Durations live in `:root`: `--duration-exit: 150ms`, `--duration-enter: 210ms`, `--duration-move: 320ms`. Allowed:

- `transition-transform duration-200 ease-out` + `motion-reduce:transition-none` (sidebar avatar button pattern).
- Button press: `active:translate-y-px` (already in `buttonVariants`).
- Collapsible chevron: `transition-transform group-data-open/collapsible:rotate-90`.
- View transitions: `vt-fade` + `vt-slide-up` (8px) for `store-enter` only.

Banned: custom `@keyframes` in TSX, scroll hijacks, parallax, auto-play carousels, shimmer keyframes (use `Skeleton`), spring physics on admin controls. `prefers-reduced-motion` zeroes view transitions globally — keep it.

## Layout

Shell (`dashboard/[storeSlug]/layout.tsx`): `SidebarProvider` → `AppSidebar` (`collapsible="icon"`) + `SidebarInset`. Sticky header `h-14 border-b bg-background/80 backdrop-blur`, `SidebarTrigger` + `StoreBreadcrumb` in `Suspense` + member chip (`hidden sm:flex`) + `HeaderActions`. Content: `flex flex-1 flex-col gap-6 p-4 md:p-8`. `h1.sr-only` carries the store name.

Nav groups: **Operação** (Dashboard, Pedidos), **Catálogo** (Produtos, Kits, Departamentos, Categorias, Tags), **Relacionamento** (Clientes, Cupons, Auditoria), **Configurações** collapsible (Loja, Entrega, Pagamentos, Notificações, Equipe, Conta). Mobile closes on navigation (`MobileSidebarCloser`); collapsed sidebar opens on demand instead of navigating blind.

Page pattern: Server Component reads through `panelClient()` and hands rows to a client island (`*-table.tsx` / `*-tabs.tsx`). No data fetch in the browser. Every route ships `loading.tsx` (table skeleton via `table-loading.tsx`, never a blank frame). Every page opens with `h2 text-xl font-semibold tracking-tight` + a `text-sm text-muted-foreground` description inside a `<section aria-labelledby>`, left-aligned with the content column — never a second `h1`, never a centered form under a left-aligned title.

Section pattern: `SettingsSection` (or the same shape) — `h2#headingId` + `text-sm text-muted-foreground` description + children, `gap-6` / `gap-1.5`. The five settings pages must read as one product.

Tables: `DataTable` + `dashboardTableFeatures` only. Status cells are `Badge` with the variant map from `panel-labels.ts` (e.g. `ORDER_STATUS_VARIANTS`). Search/filter/export copy is pt-BR with ellipsis (`Buscar por cliente ou código…`, `Status…`).

## Component recipes

| Need                     | Use                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary save/confirm     | `Button variant="default"`                                                                                                                                                       |
| Secondary                | `Button variant="secondary"` (tint) or `outline` (canvas + border)                                                                                                               |
| Quiet row action         | `Button variant="ghost"`, icon-only needs `aria-label`                                                                                                                           |
| Danger                   | `Button variant="destructive"` + confirm step; never danger-colored text alone                                                                                                   |
| Text link in prose/table | `Button variant="link"` or underlined `Link` with `underline-offset-4`                                                                                                           |
| Status                   | `Badge` with `*_VARIANTS` map; never raw `text-emerald/red/green`                                                                                                                |
| Callout                  | `Alert` + `AlertTitle`/`AlertDescription`; `variant="destructive"` for failures, never a styled div                                                                              |
| Empty result             | `Empty` + `EmptyHeader` + `EmptyMedia variant="icon"` + `EmptyTitle` + `EmptyDescription`; `DataTable` already renders it                                                        |
| Loading rows             | `Skeleton` via `table-loading.tsx`, not `animate-pulse` divs                                                                                                                     |
| Divider                  | `Separator`, not `<hr>` or `border-t` divs                                                                                                                                       |
| Form                     | `FieldGroup` + `Field` + `FieldLabel htmlFor={name}` **and** `id={name}` on the control; `data-invalid` on `Field`, `aria-invalid` + `aria-describedby` on the control           |
| Form error display       | show a field error when the field is touched **or** the form was submitted; on submit focus the first `[aria-invalid="true"]`                                                    |
| Money entry              | `InputGroup` + `InputGroupAddon R$` + `InputGroupInput`; mask while typing with `maskBrlInput`, show committed digits with `formatBrlInput`, persist cents via `parseBrlToCents` |
| Percent entry            | `InputGroup` + `%` addon; digits only while typing (`replace(/\D/g, "")`), integer 1–100                                                                                         |
| Integer entry            | `maskIntegerInput` while typing (groups thousands, strips non-digits); strip the dots before `Number()`                                                                          |
| Option set (2–7)         | `ToggleGroup` + `ToggleGroupItem`, single-select via `value={[current]}`; label the group with `FieldTitle` + `aria-labelledby`, not a bare `FieldLabel`                         |
| Overlay                  | `Dialog`/`Sheet` always with `Title` (`sr-only` ok); no manual `z-index` (`Drawer` not installed)                                                                                |
| Destructive confirm      | `AlertDialog` + `AlertDialogTitle`/`AlertDialogDescription`; confirm is `AlertDialogAction variant="destructive"`                                                                |
| Avatar                   | always with `AvatarFallback` (`initials()`); icons inside components use `data-icon`, no sizing classes                                                                          |
| Button pending state     | `Spinner` (with `data-icon="inline-start"`), never `isPending`/`isLoading` props on `Button`                                                                                     |

Control heights move together. In this repo the 32px default lives in `button.tsx` (`h-8`), `input.tsx` (`h-8`), `input-group.tsx` (`h-8`), `select.tsx` (`data-[size=default]:h-8`), `combobox.tsx` (`min-h-8` chips) and `tabs.tsx` (`group-data-horizontal/tabs:h-8`). Re-grep (`\bh-8\b|size-8\b|min-h-8\b` in `src/components/ui/`) before editing; never change one without the rest. Installed and usable: `alert`, `alert-dialog`, `empty`, `spinner`, `toggle`, `toggle-group`. Still not installed — `shadcn add` them when first needed instead of hand-rolling: `menubar`, `input-otp`, `command`, `native-select`.

## Responsive

Mobile-first. `p-4` → `md:p-8`. Member chip hides below `sm`. Sidebar collapses to icon rail, Sheet on mobile. `DataTable` scrolls internally; the page itself must never overflow: `document.documentElement.scrollWidth <= innerWidth` at 375px and 1280px. Display type clamps; tracking in `em`, never `px`.

## Wording (pt-BR, plain)

- Labels live only in `src/lib/panel-labels.ts`. Converters only in `src/lib/format.ts` (`formatBrl` takes cents for display, `formatBrlInput` renders committed digits, `maskBrlInput`/`maskIntegerInput` mask as the user types, `parseBrlToCents` parses pt-BR input back to cents, `formatDateTime` takes ISO). Money persists as integer cents (ADR-0006); inputs show an `R$` addon and never the word "centavos". Percent inputs use a `%` addon with integers 1–100. No other file invents currency/date strings.
- Date fields use the Popover + `Calendar` `DatePicker` (`signup/_components/date-picker.tsx`), never `<input type="date">`. Pass explicit `minDate`/`maxDate` computed once at module load: the calendar's year dropdown lists only the years inside them, and react-day-picker's fallback window is the **last 100 years** — a coupon expiring next year would be unpickable.
- A field another field owns is shown locked, not hidden: `perCustomerLimit` renders `1` and `disabled` while "Uso único por cliente" is checked, and its description says why. Disabling is not validation — the value is still written on submit.
- Verb-first actions: "Salvar alterações", "Revogar", "Exportar CSV". Destructive side effects stated up front ("Trocar a senha desconecta os outros dispositivos").
- States, not adjectives: `FORBIDDEN` renders the read-only notice; current session hides its own revoke button; unknown slug and non-member are both 404 with no distinction.
- No emoji badges, no "eyebrow + title + description + paragraph" stacks, no growth-marketing verbs ("Desbloqueie", "Turbo", "Super"). One heading, one description, then the work.

## Do's and Don'ts

Do: semantic tokens, built-in variants, `flex gap-*`, `size-*`, `truncate`, `cn()`, `Title` on overlays, `Fallback` on avatars, `Badge` for status, `Skeleton` for loading, `Separator` for rules, tabular numbers for money.

Don't: raw Tailwind colors (`bg-blue-500`, `text-red-600`, `text-emerald-600`, `text-neutral-700`); `space-x/y-*`; `w-10 h-10` pairs; `overflow-hidden text-ellipsis whitespace-nowrap` longhand; `dark:` raw overrides; manual `z-50` on overlays; `isPending`/`isLoading` props on `Button` (render `Spinner` instead); `window.confirm`/`window.alert` (use `AlertDialog`); `h1` inside a dashboard page (the shell owns the only `h1`; pages open with `h2 text-xl`); `htmlFor` without a matching `id` on the control; `Select` for a 2–7 option set (use `ToggleGroup`); gradients (`bg-gradient-to-*` / `bg-linear-to-*`, `bg-clip-text` sweeps); custom `@keyframes`; `<hr>`; `animate-pulse` placeholders; icon sizing classes inside components; `Field` without `FieldLabel`/`FieldTitle` or validation states; `centavos` in UI copy; raw centavos integers in inputs; `<input type="date">` in a dashboard form (use the `DatePicker`); a `<label>` wrapped around a `Checkbox` outside `src/components/ui/**` — Base UI renders a `<button>`, which `jsx-a11y/label-has-associated-control` does not count as a control, so use `Field` + `FieldLabel htmlFor={id}` + `<Checkbox id={id} />`; a `Button render={<Link />}` whose label sits on the `Button` instead of the `Link` — `jsx-a11y/control-has-associated-label` reads the `Link` element, so give it its own `aria-label` (the visible text must be contained in it, e.g. `aria-label="Entrar no painel"` for a visible `Entrar`).

## Responsive / a11y checklist (per page)

1. Keyboard: all actions reachable, `:focus-visible` 2px ring offset 2px intact, no `outline-none` without replacement.
2. Overlays have `Title`; icon-only buttons have `aria-label`; every control has an `id` matching its `FieldLabel htmlFor`; invalid fields have `data-invalid` + `aria-invalid` + `aria-describedby`; a `Link` rendered through `Button render=` carries its own `aria-label`; a `Checkbox` outside `src/components/ui/**` is labeled through `FieldLabel htmlFor` + `id`, never a wrapping `<label>`.
3. Contrast: body ≥ 7:1, secondary ≥ 4.5:1. Flag any pair below, even if a mockup specifies it.
4. 375px + 1280px: no horizontal overflow, tables scroll in place.
5. `motion-reduce`: micro transitions off, content fully usable.

## Known Gaps

- `_components/empty-state.tsx` is a custom dashed-border div, not the shadcn `Empty` primitive. Grandfathered; `DataTable` now renders `Empty` for zero rows, and replacement of this file is an approved follow-up.
- No `Chart` usage yet; no toast standard pinned for the panel (`toast` Base UI vs `sonner`). Do not invent one per page — pick once when the first need lands.
- Dark `.dark` ramp is derived from the neutral brand, not from product mockups. Call it out when touching dark surfaces.

## Iteration Guide

New dashboard page: Server `page.tsx` (panel read) + `loading.tsx` (table skeleton) + `*-table.tsx` island (columns, `Badge` variants, `formatBrl`, export columns) + labels in `panel-labels.ts` if a new enum appears.

New form route: Server `page.tsx` (heading + description) + `loading.tsx` + a `*-form.tsx` island (`@tanstack/react-form` + the shared Valibot schema, `FieldGroup`/`Field`, submit-aware field errors, `Alert` for server errors, `Spinner` on the submit button, `ToggleGroup` for small option sets).

Then run `bun run design:check`, `bun run typecheck`, `bun run lint`. No new tokens, no new shadow tiers, no new motion curves without updating this file first.
