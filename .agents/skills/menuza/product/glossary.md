# Glossary

Domain term ↔ code entity. `pt-BR` is the user-facing language; code uses ASCII slugs with labels only in the UI (`apps/web/src/lib/panel-labels.ts`, `apps/web/src/lib/format.ts`).

| Term | Meaning | Code / ticket |
| --- | --- | --- |
| Menuza | The SaaS platform | — |
| Lojista | The contracting food store; the payer | tenant / `Member` owner |
| Loja | A tenant's store | `Tenant`; "Loja ativa" switch (MEN-70) |
| Tenant | A restaurant's isolated island | `Tenant` (ADR-0001) |
| Membro | A person in a tenant's team | `Member`, `MemberIdentity`, `TenantMembership` |
| Cargo | Predefined role: Proprietario / Administrador / Atendimento | capability map (MEN-71/72) |
| Comprador | A store's consumer | `Customer` (MEN-76) |
| Carteira | Per-tenant wallet holding cashback + store credits | (MEN-95/96) |
| Cashback | Reward released when an order is paid | (MEN-95) |
| Vitrine | The buyer-facing storefront | `apps/web` `(storefront)` (MEN-77) |
| Marmita | Prepared meal; fresh or frozen | `Product` type (MEN-80) |
| Kit | Bundled composition, two modes | `Kit`, `KitItem` (MEN-82/83) |
| Complemento | Optional free/paid add-on per product | `Product`/`Variation` (MEN-80) |
| Complementos do kit | Eligible items for build-your-own | `KitItem` (MEN-82) |
| Desconto progressivo | Quantity-banded kit discount | (MEN-82) |
| Retirada | Buyer collects at the store | pickup (MEN-89) |
| Base de entrega | The single origin per tenant | (MEN-87) |
| Cobrança | Freight charge by rule | (MEN-86) |
| Agenda | On-demand + scheduled windows, cut-offs | (MEN-88) |
| Despacho | Sending an order to delivery | Spoke (MEN-99) |
| Entrega integrada / operada / retirada | Three delivery capabilities | (MEN-99) |
| Pix Automático | Recurring Pix | Asaas (MEN-181) |
| Pagamento na entrega | Pay on delivery; enters fulfilment first | (MEN-92) |
| Reembolso | Refund; total only in MVP | (MEN-94) |
| Comissão | Menuza's cut on items subtotal | (MEN-111) |
| Inadimplência | Tenant deactivated, deleted at 90 days | (MEN-110) |
| Auditoria | Business action record in a dedicated table | `AuditLog` (MEN-74) |
| Exceção | Operational item needing intervention | exceptions queue (MEN-117) |
| Importação com IA | AI spreadsheet import (post-MVP) | (MEN-124..127) |

Enum-ish DB columns are `text` + generated CHECKs over stable lowercase ASCII slugs; `Int` cents for money (ADR-0006).
