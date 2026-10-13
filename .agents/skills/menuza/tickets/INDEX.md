# tickets/ index

Every Menuza issue, grouped by roadmap epic. **Status is a snapshot (2026-10-12); re-query Linear before relying on it.** Querying rules: `README.md`.

Legend: `bl` backlog, `un` unstarted, `st` started, `ok` completed, `cx` canceled, `dup` duplicate.

## MVP — MEN-63 (`MEN-69`..`MEN-115`)

| id | st | title |
| --- | --- | --- |
| MEN-69 | bl | Multi-tenant: isolamento por tenant em todas as consultas |
| MEN-70 | bl | Tenants: cadastro de loja (PF ou PJ, ativacao por switch) |
| MEN-71 | bl | Equipe: cargos predefinidos (Proprietario/Admin/Atendimento) |
| MEN-72 | bl | Equipe: matriz de permissoes por cargo + overrides |
| MEN-73 | bl | Equipe: poderes exclusivos do proprietario |
| MEN-74 | bl | Auditoria: catalogo de eventos + retencao |
| MEN-75 | bl | Auth gestores: email + senha (2FA fora do MVP) |
| MEN-76 | bl | Auth compradores: email + senha no MVP |
| MEN-77 | bl | Vitrine responsiva + PWA (instalacao e push) |
| MEN-78 | bl | Dominios: subdominio Menuza + dominio proprio |
| MEN-79 | bl | Personalizacao visual: logo, cores, banners, fontes, ordem |
| MEN-80 | bl | Catalogo: produtos com variacoes (preco e estoque proprios) |
| MEN-81 | bl | Catalogo: estoque controlado ou ilimitado por produto/variacao |
| MEN-82 | bl | Catalogo: kits nos modos pre-selecionado e monte seu kit |
| MEN-83 | bl | Kits: baixa de estoque nas variacoes escolhidas |
| MEN-84 | bl | Carrinho por tenant + checkout |
| MEN-85 | bl | Checkout: cobertura e frete no momento do fechamento |
| MEN-86 | bl | Frete: fixo, faixa de CEP, faixa de distancia, por km |
| MEN-87 | bl | Cobertura: CEP, raio, bairro, cidade |
| MEN-88 | bl | Agenda: on-demand e agendado simultaneos + cortes |
| MEN-89 | bl | Retirada: configuracao por loja |
| MEN-90 | bl | Pagamentos: gateway por metodo, conta da loja |
| MEN-91 | bl | Pix: validade padrao 24h, encurtada pelo horario de entrega |
| MEN-92 | bl | Pagamento na entrega: pedido entra em atendimento + identificador |
| MEN-93 | bl | Pedidos: maquina de estados completa |
| MEN-94 | bl | Reembolso total + retry no mesmo pedido |
| MEN-95 | bl | Carteira: cashback e creditos do lojista (MVP) |
| MEN-96 | bl | Carteira: historico e reversoes |
| MEN-97 | bl | Cupons: fixo, percentual, frete gratis, primeira compra, min |
| MEN-98 | bl | Descontos: ordem de aplicacao e precedencia |
| MEN-99 | bl | Spoke Dispatch: integracao MVP (API + exportacao) |
| MEN-100 | bl | Notificacoes MVP: painel, email, push da PWA |
| MEN-101 | bl | Email transacional: provedor a definir |
| MEN-102 | bl | Dashboard: KPIs cuja coleta seja definida |
| MEN-103 | bl | Exportacoes: pedidos, clientes e aniversariantes |
| MEN-104 | bl | Favoritos no MVP |
| MEN-105 | bl | Avaliacoes: somente de produtos |
| MEN-106 | bl | Administracao: tenants, cobrancas, suporte, auditoria |
| MEN-107 | bl | Acesso de suporte: escopo e auditoria |
| MEN-108 | bl | Privacidade/LGPD: papeis, retencao, direitos do titular |
| MEN-109 | ok | Privacidade: data de nascimento obrigatoria no cadastro |
| MEN-110 | bl | Inadimplencia: tenant inativo + exclusao 90 dias |
| MEN-111 | bl | Cobranca: comissionamento por tenant |
| MEN-112 | bl | Cobranca: mensalidade + anual + 14 dias gratis |
| MEN-113 | bl | Pedido minimo configuravel |
| MEN-114 | bl | Observacoes por pedido (geral e de entrega) |
| MEN-115 | bl | CEP/geocodificacao: definir fornecedor |

## Post-MVP backlog — MEN-64 (`MEN-116`..`MEN-147`)

| id | st | title |
| --- | --- | --- |
| MEN-116 | bl | Acoes em lote para pedidos |
| MEN-117 | bl | Fila de excecoes operacional |
| MEN-118 | bl | Impressao de pedidos e listas operacionais |
| MEN-119 | bl | Conferencia de separacao (checklist) |
| MEN-120 | bl | Pedido manual criado pela loja |
| MEN-121 | bl | Duplicar produtos e kits dentro do tenant |
| MEN-122 | bl | Link compartilhavel de carrinho |
| MEN-123 | bl | Aviso de reposicao solicitado pelo cliente |
| MEN-124 | bl | Importacao de produtos e variacoes com IA |
| MEN-125 | bl | Importacao de cupons com IA |
| MEN-126 | bl | Importacao de clientes com IA |
| MEN-127 | bl | Importacao de pedidos com IA |
| MEN-128 | bl | Extrato detalhado de carteira |
| MEN-129 | bl | Limites de cashback por pedido/campanha |
| MEN-130 | bl | Checklist de ativacao da loja |
| MEN-131 | bl | Diagnostico de integracoes |
| MEN-132 | bl | Historico de configuracoes |
| MEN-133 | bl | Avaliar Asaas como gateway |
| MEN-134 | bl | Avaliar Pagar.me como gateway |
| MEN-135 | bl | Avaliar Mercado Pago como gateway |
| MEN-136 | bl | Avaliar PagBank como gateway |
| MEN-137 | bl | Avaliar EFI Bank como gateway |
| MEN-138 | bl | Avaliar AbacatePay como gateway |
| MEN-139 | bl | Avaliar Woovi como gateway |
| MEN-140 | bl | Avaliar Cielo como gateway |
| MEN-141 | bl | Consulta de CEP e geocodificacao |
| MEN-142 | bl | Integracao com Bling |
| MEN-143 | bl | Webhooks de saida |
| MEN-144 | bl | Google Analytics 4 por tenant |
| MEN-145 | bl | Meta Pixel e Conversions API |
| MEN-146 | bl | Google Merchant Center |
| MEN-147 | bl | Email transacional: provedor (SES, proprio, outro barato) |

## Future — MEN-65 (`MEN-148`..`MEN-159`)

| id | st | title |
| --- | --- | --- |
| MEN-148 | bl | Lalamove e demais parceiros logisticos |
| MEN-149 | bl | OSRM self-hosted para distancia por rota |
| MEN-150 | bl | Assinaturas de refeicoes (recorrencia) |
| MEN-151 | bl | Indicacao de amigos |
| MEN-152 | bl | Relatorios por IA |
| MEN-153 | bl | Automacao de atendimento WhatsApp |
| MEN-154 | bl | Recuperacao automatica de carrinho |
| MEN-155 | bl | Login Google para compradores |
| MEN-156 | bl | Login WhatsApp/SMS para compradores |
| MEN-157 | bl | Producao, ingredientes, lotes e validade operacional |
| MEN-158 | bl | Reembolso parcial |
| MEN-159 | cx | Modo de kit 'a partir' (descartado) |

## Platform and engineering (`MEN-160`..`MEN-229`)

| id | st | title |
| --- | --- | --- |
| MEN-160 | bl | Infra: VPS Hetzner/Contabo (provisioning inicial) |
| MEN-161 | bl | Reverse proxy: Caddy com TLS automatico |
| MEN-162 | bl | Postgres 16 + replica de leitura no VPS dedicado |
| MEN-163 | bl | Docker Compose para Next, orpc, Postgres, Redis, Caddy |
| MEN-164 | bl | Redis (Upstash ou self-hosted) para cache + BullMQ |
| MEN-165 | ok | orpc: contratos tipados entre api e web |
| MEN-166 | ok | Prisma + Prisma Migrate com adapter Postgres |
| MEN-167 | ok | Auth propria + argon2 + sessoes server-side |
| MEN-168 | bl | Webhooks idempotentes com HMAC |
| MEN-169 | bl | Pino + Better Stack/Axiom para logs |
| MEN-170 | ok | OpenTelemetry para traces distribuidos |
| MEN-171 | ok | Sentry para erros web e api |
| MEN-172 | bl | BullMQ: filas e cron self-hosted |
| MEN-173 | bl | Storage S3-compat (R2/B2) + CDN Cloudflare |
| MEN-174 | bl | Mailer abstrato: SMTP self-hosted + adapter SES |
| MEN-175 | bl | Feature flags por tenant em Postgres + cache Redis |
| MEN-176 | ok | GitHub Actions CI: policy, typecheck, test, build |
| MEN-177 | dup | Monorepo (superseded by MEN-205) |
| MEN-178 | ok | bun test: unit + integration |
| MEN-179 | ok | Next.js 16.4 canary + RSC + Cache Components |
| MEN-180 | ok | Isolamento multi-tenant sem RLS: middleware orpc + Prisma |
| MEN-181 | bl | Asaas: cobranca SaaS recorrente (assinatura, Pix Autom, boleto) |
| MEN-182 | bl | BrasilAPI (CEP) + Nominatim (geocode) |
| MEN-183 | bl | Spoke Dispatch: integracao MVP |
| MEN-184 | bl | Monitoramento VPS: CPU, RAM, disco, fila |
| MEN-185 | ok | orpc server: Bun.serve + procedures tipadas |
| MEN-186 | ok | orpc: middleware de tenant (contexto tipado) |
| MEN-187 | ok | orpc: error contract + logging estruturado |
| MEN-188 | bl | orpc: streaming procedures para export e progresso |
| MEN-189 | bl | orpc: export OpenAPI para parceiros/integradores |
| MEN-190 | ok | TanStack Query SSR-first no Next 16 |
| MEN-191 | bl | TanStack DB: colecoes tipadas para cache local |
| MEN-192 | ok | TanStack Table para listagens densas |
| MEN-193 | bl | TanStack Form com Valibot para formularios complexos |
| MEN-194 | ok | Serwist: PWA service worker, manifest, push |
| MEN-195 | bl | Offline-first no painel da loja com sync |
| MEN-196 | ok | Fila offline em IndexedDB com idb-keyval |
| MEN-197 | st | web-push: VAPID para notificacoes PWA |
| MEN-198 | bl | t3-env para envs tipadas em web e api |
| MEN-199 | bl | Rate-limit via Redis (sem lib dedicada) |
| MEN-200 | bl | orpc links para cache invalidation |
| MEN-201 | bl | Next revalidateTag + cache components |
| MEN-202 | bl | Targets: Chrome 150+/Edge/Safari 18+ |
| MEN-203 | bl | Feature flags no front (flags Postgres ja existentes) |
| MEN-204 | bl | bun test para unit, integration e e2e leve |
| MEN-205 | ok | Monorepo: apps/commerce + apps/tenant + apps/orpc-server |
| MEN-206 | ok | apps/orpc-server: base Bun compartilhada |
| MEN-207 | ok | apps/commerce: API publica por tenant |
| MEN-208 | ok | apps/tenant: API de gestao (painel) |
| MEN-209 | ok | apps/web Next unico com rotas admin/loja |
| MEN-210 | ok | Subdominio: roteamento por host no apps/web |
| MEN-211 | bl | Caddy: rotas /commerce e /tenant separadas |
| MEN-212 | ok | Workers: processo unico para commerce + tenant |
| MEN-213 | ok | Sessao: mesma engine, namespaces separados |
| MEN-214 | bl | Auth comprador em apps/commerce |
| MEN-215 | bl | Auth gestor em apps/tenant |
| MEN-216 | bl | Admin do Menuza via apps/tenant + guard extra |
| MEN-217 | bl | Webhooks Asaas de pedidos -> apps/commerce |
| MEN-218 | bl | Webhooks Asaas SaaS -> apps/tenant |
| MEN-219 | bl | Cache compartilhado com prefixos por app |
| MEN-220 | ok | Serwist: estrategias de cache por rota |
| MEN-221 | bl | TanStack Query: SSR dehydrate/hydrate + mutations |
| MEN-222 | bl | Prisma: migration em deploy + seeders por tenant |
| MEN-223 | bl | Observabilidade: source maps da API no Sentry (bundle em vez de binario compilado) |
| MEN-224 | ok | Dashboard: mockup e estrutura do painel de gestao |
| MEN-225 | ok | Dashboard: auth real + tenant por slug no dominio principal |
| MEN-226 | bl | Auth: OAuth com Google |
| MEN-227 | bl | Auth: OTP por e-mail e SMS |
| MEN-228 | bl | Auth: contas bot / de servico |
| MEN-229 | bl | Plataforma: OAuth para apps de terceiros + permissoes por loja e conta |
