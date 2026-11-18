# SEO no painel (MEN-263) — kit, loja, links, conflitos

Cupom fora. Sem aba, sem links, sem preview de SEO em cupom.

Não reconstruir o que já existe:

- `SeoForm` na aba do produto (`product-tabs.tsx`): reverter por campo e por entidade, rótulos de herança, prévia SERP, prévia JSON-LD.
- Templates da loja em `settings/store` (`SeoSettingsForm`): `%store%`, `%entity%`, `%city%`, imagem social, prévia ao vivo.
- API genérica: `getSeo` / `saveSeo` / `revertSeo` para `store | department | category | tag | product | kit | coupon`. O contrato do cupom fica; a UI não usa.
- Herança: entidade → linha da loja → template → fallback. `canonicalUrl` e `jsonLd` não herdam.

## Fase 1 — Aba SEO do kit

Espelha `product-tabs.tsx`. Sem rota `/edit/seo`.

- Loader de `catalog/kits/$kitId.tsx` chama `getPanelSeo` (`entityType: kit`).
- Aba SEO ao lado do `KitForm`, `keepMounted`, rascunho não se perde.
- `SeoForm` reutilizado. `previewContext`: nome, descrição, slug, `baseCents` como preço único.
- JSON-LD sugerido só quando o tipo for `kit` (hoje o sugerido exige `entityType === "product"`).
- Departamento, categoria e tag são só lista. Sem página de detalhe, sem aba SEO neste plano.

Verify: `bun run typecheck`, entrada do kit em `apps/web/tests/dashboard-routes.test.ts`.

## Fase 2 — Vários links (produto e kit)

Hoje um `canonicalUrl`. Novo, só produto e kit.

- Tabela `SeoLink`: `tenantId`, `entityType`, `entityId`, `rel` (`alternate` | `sameAs` | `related`), `href` (http/https), `hreflang` opcional. Máximo 8. Lista vazia apaga todos. `ON DELETE` junto da entidade.
- `canonicalUrl` continua o campo único. Link extra não vira canônico.
- Contrato: lista no `SeoFields` / save parcial. Cupom, taxonomia e loja não recebem o campo.
- Vitrine emite `<link>` na página do produto e do kit. Mais ninguém.

Verify: `cargo test -p persistence` (teto de 8, href inválido, tenant), `cargo run -p openapi -- --check`.

## Fase 3 — Avisos de conflito

Função pura. Avisa. Nunca bloqueia o save.

- Título acima de 60 caracteres. Descrição acima de 155.
- Host do canônico diferente do host da loja.
- Dois links com o mesmo `href`.
- `hreflang` repetido para a mesma língua.
- `url` do JSON-LD diferente do canônico efetivo.
- Título igual ao de outra entidade: uma query indexada no save. Sem índice, sem esse aviso. Sem varredura do catálogo.

Verify: um teste unitário da função pura.

## Fase 4 — Loja (lacuna pequena)

Templates já existem. Acrescentar a linha de cobertura a partir de `listPanelSeoEntities` (`hasOverride`). Sem token novo, sem upload de OG, sem reverter para default da plataforma, sem script de head/body (MEN-254).

Verify: `bun run design:check`.

## Aceite

`revalidateTag` sai. Cache da vitrine é por request; o save aparece na próxima leitura. Checks de `engineering/checks.md`.

## Fora

Cupom. IA (MEN-258). Edição em massa. Head/body cru (MEN-254). OG dinâmico (MEN-256). CMS (MEN-231). SEO de taxonomia até existir página de detalhe.
