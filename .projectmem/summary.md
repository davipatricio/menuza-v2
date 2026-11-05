# projectmem - menuza-v2

_Last updated: 2026-11-04_

## Project purpose

Local development foundation for the Menuza product. Not the commerce product.

## Recent issues

- [DONE] #legacy_0b43 Legacy issue: fix(web): simplify dashboard breadcrumb and keep sessions alive (fixed)

## Decisions

- No decisions logged yet.

## Notes

- chore(opencode): refresh agent roster for v2, add reviewer and DCP plugin
- feat(coupons): painel de cupons com histórico paginado e métricas (MEN-286) (#74)
- feat(coupons): escopo por produto, soft delete e controle de status na lista (MEN-97)
- feat(panel): paleta de busca global com Ctrl/Cmd+K
- chore(opencode): atualiza agentes, instrucoes e planos de tarefas
- feat(web): migrate dashboard to TanStack Start and restore UI parity
- chore(infra): run Valkey 9.1 instead of Redis 7.4
- chore(agents): raise critic step budget to 12
- New feature: feat(web): move login and onboarding to TanStack Form with Valibot [apps/web/src/features/auth/components/login-form.tsx]
- Kit ordering UX: HTML5 drag-and-drop for desktop paired with 1-tap ChevronUp/ChevronDown buttons for mobile touch/accessibility; group header layout expands name input without gap

## Key files

- `apps/orpc-server/openapi/commerce.json`
- `apps/orpc-server/openapi/tenant.json`
- `apps/orpc-server/test/openapi.test.ts`
- `apps/web/src/lib/panel-labels.ts`
- `packages/shared/src/commerce/contract.ts`
- `packages/shared/src/commerce/index.ts`
- `packages/shared/src/commerce/orders/create-order.ts`
- `packages/shared/src/commerce/orders/types.ts`
- `packages/shared/src/commerce/payments/types.test.ts`
- `packages/shared/src/commerce/payments/types.ts`
- `packages/shared/src/panel/contracts.ts`
- `packages/shared/src/tenant/index.ts`
- `apps/orpc-server/package.json`
- `apps/orpc-server/src/auth/types.ts`
- `apps/orpc-server/src/crypto/index.ts`
- `apps/orpc-server/src/crypto/secrets.ts`
- `apps/orpc-server/test/secrets.test.ts`
- `packages/api-tenant/src/domains/tenant/subdomains/panel/deletePaymentIntegration.impl.ts`
- `packages/api-tenant/src/domains/tenant/subdomains/panel/getPaymentSettings.impl.ts`
- `packages/api-tenant/src/domains/tenant/subdomains/panel/paymentSupport.ts`

## Open questions

- None logged yet.
