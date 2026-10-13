# Scope

`PRODUCT.md` §22–§28. Linear parents: **MEN-63** (MVP, 47 items), **MEN-64** (post-MVP backlog, 32), **MEN-65** (future, 12). A feature discussed somewhere is not automatically in the MVP — the lists below are the authority.

## In the MVP (MEN-63)

| Area | Tickets |
| --- | --- |
| Tenants & store | MEN-70 cadastro (PF/PJ, switch), MEN-77 vitrine + PWA, MEN-78 dominios, MEN-79 personalizacao visual |
| Team & access | MEN-71 cargos, MEN-72 matriz + overrides, MEN-73 poderes do proprietario |
| Auth | MEN-75 gestores, MEN-76 compradores (email + senha) |
| Catalog & stock | MEN-80 produtos/variacoes, MEN-81 estoque controlado/ilimitado, MEN-82 kits (2 modos), MEN-83 baixa de componentes |
| Coupons | MEN-97 cupons, MEN-98 ordem de aplicacao |
| Cart & checkout | MEN-84 carrinho/checkout, MEN-85 cobertura+frete no fechamento, MEN-113 pedido minimo, MEN-114 observacoes |
| Coverage & freight | MEN-86 frete (4 modelos), MEN-87 cobertura, MEN-115 fornecedor de CEP/geocode |
| Scheduling & pickup | MEN-88 agenda on-demand + agendado + cortes, MEN-89 retirada |
| Payments | MEN-90 gateway por metodo (Asaas + secundario), MEN-91 Pix 24h, MEN-92 pagamento na entrega, MEN-94 reembolso total + retry |
| Wallet | MEN-95 cashback + creditos, MEN-96 historico e reversoes |
| Orders | MEN-93 maquina de estados |
| Notifications | MEN-100 painel/email/push, MEN-101 provedor de email |
| Dispatch | MEN-99 Spoke Dispatch (API + exportacao) |
| Customers & growth | MEN-103 exportacoes, MEN-104 favoritos, MEN-105 avaliacoes (produto) |
| Dashboard | MEN-102 KPIs (cuja coleta esteja definida) |
| Admin & support | MEN-106 admin, MEN-107 acesso de suporte auditado |
| Privacy | MEN-108 LGPD (papeis, retencao, direitos), MEN-109 data de nascimento (LGPD gate) |
| Isolation | MEN-69 isolamento por tenant |
| SaaS billing | MEN-110 inadimplencia, MEN-111 comissionamento, MEN-112 planos + trial |
| Audit | MEN-74 catalogo de eventos + retencao |

## Post-MVP backlog (MEN-64)

Operations (MEN-116 acoes em lote, MEN-117 fila de excecoes, MEN-118 impressao, MEN-119 conferencia, MEN-120 pedido manual); catalog & AI migration (MEN-121 duplicar, MEN-122 link de carrinho, MEN-123 aviso de reposicao, MEN-124..127 importacao por IA); wallet & install (MEN-128 extrato, MEN-129 limites de cashback, MEN-130 checklist de ativacao, MEN-131 diagnostico de integracoes, MEN-132 historico de configuracoes); gateways (MEN-133..140 Asaas, Pagar.me, Mercado Pago, PagBank, EFI, AbacatePay, Woovi, Cielo); integrations (MEN-141 CEP/geocode, MEN-142 Bling, MEN-143 webhooks de saida, MEN-144 GA4, MEN-145 Meta Pixel, MEN-146 Merchant Center, MEN-147 provedor de email).

## Out of the MVP (MEN-65)

MEN-148 Lalamove/outros parceiros, MEN-149 OSRM, MEN-150 assinaturas de refeicoes, MEN-151 indicacao, MEN-152 relatorios por IA, MEN-153 automacao WhatsApp, MEN-154 recuperacao de carrinho, MEN-155 login Google (comprador), MEN-156 login WhatsApp/SMS, MEN-157 producao/lotes/validade, MEN-158 reembolso parcial, MEN-159 kit "a partir" (canceled).

## Ready bar

MVP is done when the **12 acceptance scenarios** in `../engineering/checks.md` pass — not when the cards are marked Done (`PRODUCT.md` §24, §28). There is no dedicated pilot.
