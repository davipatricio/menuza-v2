# Move the login and onboarding forms to TanStack Form + shared Valibot schemas

Status: done
Updated: S6

## Context

`apps/web/src/features/auth/AGENTS.md` and `apps/web/AGENTS.md` already claim every
auth form uses `@tanstack/react-form` with the shared Valibot schemas. That is true
for `account-form.tsx`, `store-form.tsx` and `invite-form.tsx`, but false for the two
forms in scope: `login-form.tsx` and `signup/onboarding-form.tsx` still hold field
state in `useState`. This plan makes the claim true, keeps the current UI copy and
payloads, and adds pure tests (Bun test, no DOM).

Reference pattern to copy verbatim: `signup/account-form.tsx` — `useForm({ defaultValues,
validators: { onSubmit, onBlur }, onSubmit })`, `form.Field` render props with
`field.handleChange` / `field.handleBlur`, `isInvalid = field.state.meta.isTouched &&
!field.state.meta.isValid`, `Field` / `FieldLabel` / `FieldError` / `FieldGroup`,
`fieldErrors(field.state.meta.errors)`, and `form.Subscribe` for `isSubmitting`.

## Out of scope

- No restyle: copy, spacing classes, button variants and icons stay byte-identical.
- No change to `account-form.tsx`, `invite-form.tsx`, `store-form.tsx`, `date-picker.tsx`.
- No dedupe of the two `form-errors.ts` copies (`src/lib/` and `signup/`) — mention only.
- No Rust, OpenAPI, generated client (`src/lib/api/**`) or shared-contract change.
- No new dependency, no DOM/RTL/jsdom test setup, no `*.test.tsx`.
- No route changes: `LoginForm({ returnTo })` and `OnboardingForm({ initial })` keep
  their exact props and both consumers.

## Assumptions

- verified: `v.nonOptional(wrapped, message)` exists in Valibot 1.5.0 —
  `node_modules/.bun/node_modules/valibot/dist/index.d.mts:5683,5692`; a `undefined`
  value fails with the supplied message, output type drops `undefined`.
- verified: form-level Standard Schema validators map issues to fields by path —
  `@tanstack/form-core/src/standardSchemaValidator.ts` returns `{ form, fields }`;
  submit marks every field `isTouched` (`FormApi.ts:1877`), so the account-form
  `isTouched && !isValid` gate shows errors after a failed submit.
- verified: `form.Subscribe` children may be any node, including the `<form>` element,
  and `state.isSubmitting` is selectable (`@tanstack/react-form/src/useForm.tsx`).
- verified: `Onboarding` = `v.InferOutput<OnboardingSchema>` with `segment`/`referral`
  nullable (`packages/shared/src/panel/contracts.ts:110-114,2843`);
  `SaveOnboardingInputSchema` makes them optional (`:116-120`).
- verified: `apps/web/tests/**` is pure Bun test, no DOM, imports source relatively with
  explicit `.ts` (`apps/web/tests/AGENTS.md`, `return-to.test.ts:1-2`).
- verified: `apps/web/tsconfig.json` `include` is `["src", "vite.config.ts"]`, so new
  tests are run by `bun test` but not by `bun run --filter '@menuza/web' typecheck`.
- unverified: `@menuza/shared/tenant` resolves inside `bun test` from `apps/web/tests`
  (only the `/push` subpath has precedent, `push-subscription.test.ts:2`). Same
  specifier the app itself uses; S4 proves it.
- unverified: the five new pt-BR validation strings listed in S1 — user sign-off needed;
  they are the only new copy.

## Code map

- `apps/web/src/features/auth/components/login-form.tsx` — `LoginForm`, `GENERIC_ERROR:10`,
  `handleSubmit:23`, `method="post"`/`aria-busy:52`, inputs `required` + `aria-invalid`
  tied to the server error, error banner `id="login-error"`.
- `apps/web/src/features/auth/components/signup/onboarding-form.tsx` — `OptionGroup:37`,
  `PERSONAS:15`, `SEGMENTS:22`, `REFERRALS:30`, `SAVE_ERROR:95`, `PERSONA_REQUIRED:97`,
  `submit(skipOptional):113`, `method="post" noValidate` + preventDefault/stopPropagation:140-148,
  skip button rendered only when `persona` is set:191.
- `apps/web/src/features/auth/components/signup/account-form.tsx` — reference form
  (`useForm:57`, `form.Field:103`, `form.Subscribe:231`, `FieldError:120`).
- `apps/web/src/features/auth/components/signup/form-errors.ts:8` — `fieldErrors`.
- `apps/web/src/lib/form-errors.ts:8` — identical helper; the documented import for
  non-signup forms (`apps/web/AGENTS.md`).
- `apps/web/src/components/ui/field.tsx` — `Field:67`, `FieldLabel:93`, `FieldGroup:39`,
  `FieldError:165` (accepts `errors?: Array<{ message?: string }>`).
- `packages/shared/src/panel/contracts.ts` — `OnboardingPersonaSchema:98`,
  `OnboardingSegmentSchema:100`, `OnboardingReferralSchema:108`,
  `SaveOnboardingInputSchema:116`, `LoginInputSchema:122`.
- `packages/shared/src/tenant/index.ts:21-22,179` — re-exports both schemas; `Onboarding` type at `:179`.
- `apps/web/src/lib/session-client.ts` — `loginSession:91`, `saveOnboarding:111`
  (`SaveOnboardingInput = Parameters<TenantClient["profile"]["saveOnboarding"]>[0]:36`).
- `apps/web/src/features/auth/server/session-client.ts:8-18` — re-export seam used by both forms.
- `apps/web/src/routes/dashboard/login.tsx:52` and
  `apps/web/src/routes/dashboard/signup/_onboarding/perfil.tsx:27` — consumers, untouched.
- `apps/web/tests/return-to.test.ts`, `apps/web/tests/push-subscription.test.ts` — conventions.
- New helper `apps/web/src/features/auth/lib/form-schemas.ts` (pure, no React) must export
  exactly:
  - `LoginFormSchema` — Valibot object, output `{ email: string; password: string }`.
  - `loginErrorMessage(error: unknown): string`.
  - `OnboardingFormSchema` — Valibot object; output
    `{ persona: Persona; segment?: Segment; referral?: Referral }`.
  - `onboardingPayload(answers: v.InferOutput<typeof OnboardingFormSchema>, skipOptional: boolean): v.InferInput<typeof SaveOnboardingInputSchema>`.

## Files

Create:

- `apps/web/src/features/auth/lib/form-schemas.ts`
- `apps/web/tests/auth-forms.test.ts`

Modify:

- `apps/web/src/features/auth/components/login-form.tsx`
- `apps/web/src/features/auth/components/signup/onboarding-form.tsx`

## Steps

- [x] S1 Create the pure helper | files: `apps/web/src/features/auth/lib/form-schemas.ts` | owner: implementer | verify: `bunx oxfmt apps/web/src/features/auth/lib/form-schemas.ts && bunx oxlint apps/web/src/features/auth/lib/form-schemas.ts && bun run --filter '@menuza/web' typecheck` | P1
- [x] S2 Migrate `LoginForm` to `useForm` | files: `apps/web/src/features/auth/components/login-form.tsx` | owner: implementer | verify: `bunx oxfmt apps/web/src/features/auth/components/login-form.tsx && bunx oxlint apps/web/src/features/auth/components/login-form.tsx && bun run --filter '@menuza/web' typecheck` | P2
- [x] S3 Migrate `OnboardingForm` to `useForm` | files: `apps/web/src/features/auth/components/signup/onboarding-form.tsx` | owner: implementer | verify: `bunx oxfmt apps/web/src/features/auth/components/signup/onboarding-form.tsx && bunx oxlint apps/web/src/features/auth/components/signup/onboarding-form.tsx && bun run --filter '@menuza/web' typecheck` | P2
- [x] S4 Add pure tests | files: `apps/web/tests/auth-forms.test.ts` | owner: implementer | verify: `bun test apps/web/tests/auth-forms.test.ts` | P2
- [x] S5 Review the diff against behavior lock | files: `apps/web/src/features/auth/lib/form-schemas.ts`, `apps/web/src/features/auth/components/login-form.tsx`, `apps/web/src/features/auth/components/signup/onboarding-form.tsx`, `apps/web/tests/auth-forms.test.ts` | owner: reviewer | verify: `bunx oxfmt --check apps/web/src/features/auth/lib/form-schemas.ts apps/web/src/features/auth/components/login-form.tsx apps/web/src/features/auth/components/signup/onboarding-form.tsx apps/web/tests/auth-forms.test.ts && bunx oxlint apps/web/src/features/auth apps/web/tests/auth-forms.test.ts` | P3
- [x] S6 Verify the Definition of done | files: `apps/web/src/features/auth/lib/form-schemas.ts`, `apps/web/src/features/auth/components/login-form.tsx`, `apps/web/src/features/auth/components/signup/onboarding-form.tsx`, `apps/web/tests/auth-forms.test.ts` | owner: verifier | verify: `bun run design:check && bun run typecheck && bun test && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all --check && cargo run -p openapi -- --check && bun run lint && bun run fmt:check && bun run build` | P4

### S1 notes

- `LoginFormSchema`: `v.object` mirroring `LoginInputSchema` rules, but with explicit
  pt-BR messages (Valibot defaults are English):
  `email` = `v.pipe(v.string(), v.trim(), v.nonEmpty("Informe seu e-mail."), v.email("Informe um e-mail válido."), v.maxLength(254, "E-mail muito longo."))`;
  `password` = `v.pipe(v.string(), v.nonEmpty("Informe sua senha."), v.maxLength(200, "Senha muito longa."))`.
  Comment: same rules as `LoginInputSchema`; local only to carry pt-BR copy; parity is pinned by S4.
- `loginErrorMessage`: returns `"E-mail ou senha incorretos."` for
  `error instanceof ApiError && error.code === "UNAUTHORIZED"`, otherwise
  `"Não foi possível entrar. Tente novamente."` (move `GENERIC_ERROR` here).
- `OnboardingFormSchema`: `v.object({ persona: v.nonOptional(v.optional(OnboardingPersonaSchema), "Escolha uma opção para continuar."), segment: v.optional(OnboardingSegmentSchema), referral: v.optional(OnboardingReferralSchema) })`.
  `nonOptional` is a **schema constructor**, not a pipe action (`index.d.mts:5683,5692`); its output type is `NonOptional<InferOutput<TWrapped>>`, so `undefined` is dropped and `persona` is `Persona`.
- `onboardingPayload`: `skipOptional` returns `{ persona, segment: undefined, referral: undefined }`;
  otherwise `{ persona, segment: answers.segment, referral: answers.referral }`.
  Never `null` — absence is `undefined`, matching `SaveOnboardingInputSchema`.

### S2 notes

- Keep `returnTo` prop, `safeReturnTo` and the document navigation exactly
  (`window.location.assign(safeReturnTo(returnTo))`; the two identical branches collapse to one call).
- `defaultValues: { email: "", password: "" }`; `validators: { onSubmit: LoginFormSchema, onBlur: LoginFormSchema }` (account-form parity).
- The form element stays `<form method="post" noValidate onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit(); }} aria-busy={isSubmitting}>`, with `isSubmitting` coming from the `form.Subscribe` wrapper (account-form parity, `account-form.tsx:96-100`). `preventDefault` is mandatory because `method="post"` would otherwise perform a native POST.
- `serverError` stays `useState`; `pending` is deleted — `form.Subscribe selector={(state) => state.isSubmitting}` wraps the `<form>` and drives `aria-busy`, `disabled` on both inputs and the button label `"Entrando…"`/`"Entrar"`.
- Add `noValidate`; keep `method="post"`, `required`, `type="email"`, `autoComplete`, `placeholder`, `id="login-error"` banner, `role="alert"`, and `aria-describedby` wiring.
- Replace each `<div className="flex flex-col gap-2">` + `Label` with `Field` + `FieldLabel` (same default `gap-2`), add `FieldError errors={fieldErrors(field.state.meta.errors)}` when `isInvalid`, and `aria-invalid={isInvalid || Boolean(serverError)}`. Import `fieldErrors` from `@/lib/form-errors.ts` (the documented helper for non-signup forms) and `LoginFormSchema`/`loginErrorMessage` from `../lib/form-schemas.ts`.
- `onSubmit: async ({ value }) => { setServerError(null); try { await loginSession({ email: value.email.trim(), password: value.password }); window.location.assign(safeReturnTo(returnTo)); } catch (error) { setServerError(loginErrorMessage(error)); } }`.

### S3 notes

- `defaultValues` from `initial`: `persona: initial?.persona ?? undefined`, `segment: initial?.segment ?? undefined`, `referral: initial?.referral ?? undefined`.
- `validators: { onSubmit: OnboardingFormSchema, onBlur: OnboardingFormSchema }`.
- `onSubmit`: `const answers = v.parse(OnboardingFormSchema, value);` (narrows `persona` to required; validation already passed) then
  `await saveOnboarding(onboardingPayload(answers, skipOptional)); await router.invalidate(); void navigate({ to: "/dashboard/signup/escolha" });`
  catch → `setServerError(SAVE_ERROR)`.
- Skip intent: `const skipOptionalRef = useRef(false)`; ghost button `onClick` sets it `true` then `void form.handleSubmit()`; `onSubmit` reads and resets it, so both buttons share one `isSubmitting` and one banner. Document why in a comment.
- `OptionGroup` keeps its rendered markup and its current props; only the value source changes to `value={field.state.value ?? null}` and `onChange={(next) => field.handleChange(next)}`. Do **not** add an `error` prop and do not move the persona-required message inline: the existing form-level banner stays where it is today (below the three option groups), rendered from a `form.Subscribe` on the persona field meta:
  `<form.Subscribe selector={(state) => state.fieldMeta.persona}>{(meta) => (meta?.isTouched && !meta.isValid ? <p role="alert" …>{PERSONA_REQUIRED}</p> : null)}</form.Subscribe>`,
  using the unchanged string `"Escolha uma opção para continuar."`. `fieldMeta` is part of `FormState` (`@tanstack/form-core` `FormApi.d.ts:298`) and carries `isTouched`/`isValid`; keep the current banner markup and className so the UI does not move.
- Keep `method="post"`, `noValidate`, `onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit(); }}`, the `SAVE_ERROR` banner, the two-button layout, `"Continuar"`/`"Salvando…"`, `"Pular perguntas opcionais"`, and skip-button visibility driven by `form.Subscribe selector={(state) => state.values.persona !== undefined}` nested inside the `isSubmitting` Subscribe. Imports: `import * as v from "valibot";`, `useRef` from `react`, `OnboardingFormSchema`/`onboardingPayload` from `../../lib/form-schemas.ts`, and `fieldErrors` from `./form-errors.ts` if a field-level error is still rendered.

### S4 notes

`import { describe, expect, test } from "bun:test";`, `import * as v from "valibot";`, then relative imports
`{ LoginFormSchema, loginErrorMessage, OnboardingFormSchema, onboardingPayload } from "../src/features/auth/lib/form-schemas.ts"`, `{ ApiError } from "../src/lib/api-error.ts"`, and
`{ LoginInputSchema, SaveOnboardingInputSchema } from "@menuza/shared/tenant"` (subpath export; `push-subscription.test.ts:2` is the precedent).
Cases:

1. `LoginFormSchema` accepts a valid pair and trims `"  ana@menuza.com  "` to `"ana@menuza.com"`.
2. Rejects empty email, malformed email, empty password, email >254 and password >200.
3. Parity table: for every fixture, `LoginFormSchema` success equals
   `v.safeParse(LoginInputSchema, { email: fixture.email.trim(), password: fixture.password }).success`.
4. `loginErrorMessage`: `new ApiError("UNAUTHORIZED")` → `"E-mail ou senha incorretos."`;
   `new ApiError("CONFLICT")` and `new Error("x")` → `"Não foi possível entrar. Tente novamente."`.
5. `OnboardingFormSchema` rejects `{}` with `"Escolha uma opção para continuar."` on path `persona`;
   accepts every persona; accepts with and without `segment`/`referral`; rejects an unknown segment.
6. `onboardingPayload`: full answers keep all three; `skipOptional` yields
   `{ persona, segment: undefined, referral: undefined }`; both outputs parse with `SaveOnboardingInputSchema`.
7. No React, no component render, no snapshot.

### S5 notes

Reviewer blocks on: copy unchanged (only the five new pt-BR strings allowed), `method="post"` /
`noValidate` / preventDefault / stopPropagation / `aria-busy` preserved, no markup restyle beyond
`Field`/`FieldLabel`/`FieldError` swaps, no `useState` left for field values, no new dependency,
no assertion without a `// SAFETY:` line, payload shape identical to today
(`{ persona, segment, referral }`, `undefined` on skip).

## Parallel

- P1: S1
- P2: S2, S3, S4
- P3: S5
- P4: S6

## Command notes

- Runtime shells need `PATH="/root/.local/bin:$PATH"` for `bunx` (oxfmt/oxlint/turbo).
- `bun test` from the repo root discovers `apps/web/tests/*.test.ts`; a single file can be run with `bun test apps/web/tests/auth-forms.test.ts`.
- `bun run typecheck` covers `apps/web/src` only; test files are excluded by `apps/web/tsconfig.json`.
- `bun run lint` / `bun run fmt:check` are repo-wide and may report pre-existing warn-only
  sonarjs findings; judge by the touched paths.

## Definition of done

Run in this order and report each result:

1. `bun run design:check`
2. `bun run typecheck`
3. `cargo test --workspace`
4. `bun test`
5. `cargo clippy --workspace --all-targets -- -D warnings`
6. `cargo fmt --all --check`
7. `cargo run -p openapi -- --check`
8. `bun run lint`
9. `bun run fmt:check`
10. `bun run build`

Plus, for the four touched files: `bunx oxfmt --check <paths>` and `bunx oxlint <paths>`; a second
formatter pass must change nothing.

## Risks / Not doing

- Persona-required error stays in the existing top banner (same string, same markup, same condition: touched + invalid after submit); it is not moved inline.
- Form-level `onBlur` validates the whole schema, so tabbing out of the first field can reveal the
  second field's error early. This mirrors `account-form.tsx`; switch to per-field validators only
  if the reviewer flags it.
- Login gains `noValidate`, so browser-native bubbles are replaced by inline pt-BR `FieldError`s.
- New pt-BR strings (S1) are unapproved copy; five lines, listed above.
- No component-level tests: there is no DOM test runner, and adding one is a separate decision.
- The duplicate `fieldErrors` helpers stay duplicated; deduping touches unrelated forms.
- `v.parse` in `onSubmit` re-validates the three onboarding fields; negligible cost, keeps
  `persona` non-optional without an assertion.
