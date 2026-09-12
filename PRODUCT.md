# Menuza

> SaaS multi-tenant de ecommerce para facilitar vendas, logística e marketing de lojas de marmitas saudáveis.

**Status:** definição de produto para o MVP.  
**Fonte:** descoberta de 200 perguntas e esclarecimentos posteriores do fundador.  
**Regra de leitura:** decisões mais recentes substituem respostas anteriores. Itens identificados como pendentes ou propostas não são requisitos aprovados.

## 1. Visão e posicionamento

O Menuza fornece a plataforma para cada lojista operar seu próprio ecommerce. Não opera uma loja de alimentos, não é um marketplace e não terá uma listagem global de lojas para o comprador.

O foco inicial são lojas de marmitas saudáveis frescas e congeladas, com possibilidade de atender restaurantes com linha saudável, pet food, hortifruti e negócios similares. A região inicial é São Paulo e entorno, sem tratá-la como restrição permanente do produto.

O cliente contratante é o lojista. O público consumidor, posicionamento alimentar, frequência de compra e estratégia comercial variam por loja; não devem ser impostos globalmente pelo Menuza.

### Objetivos

- Facilitar vendas, logística e marketing.
- Aumentar recompra e melhorar margem.
- Reduzir erros de pedidos e trabalho operacional.
- Oferecer personalização da vitrine e das regras comerciais.
- Permitir escolher provedores de pagamento por método.
- Dar acesso adequado à equipe de cada loja.

### Público contratante

- Lojas de todos os portes; volume típico e ticket médio ainda desconhecidos.
- Decisores principais: proprietário e gerente.
- Familiaridade tecnológica esperada: intermediária.
- Ferramentas atuais incluem ecommerce concorrente, iFood, planilhas, ERP, estoque e CRM.

### Referências

- Concorrente: Octofood.
- Lojas e experiências de referência: Naturallis, Mawi Foods, Da Mamãe Fitness e Liv Up.
- Referências não implicam copiar funcionalidades ou identidade visual.

## 2. Modelo comercial

A assinatura é contratada e cobrada **por tenant/restaurante**.

| Plano   | Mensalidade | Comissão sobre vendas elegíveis |
| ------- | ----------: | ------------------------------: |
| Starter |      R$ 400 |                           0,80% |
| Pro     |      R$ 800 |                           0,40% |
| Max     |    R$ 1.600 |                           0,10% |

- A comissão é devida quando o pedido estiver **pago**; não exige conclusão da entrega.
- Pedidos pendentes e cancelados não geram comissão.
- Pagamento na entrega, após a loja registrá-lo como recebido, também gera comissão.
- Base confirmada: **subtotal de itens**. Frete, descontos e uso de carteira não entram na base.
- Reembolso não estorna a comissão do Menuza.
- Pedido pago e depois cancelado: cancelar não estorna; somente reembolso total poderia motivar análise manual (decisão ainda aberta).
- Há planos mensais e anuais; preços anuais e eventuais descontos ainda não definidos.
- Teste gratuito de 14 dias.
- Venda de módulos adicionais prevista; composição e preços pendentes.
- Cobrança da assinatura por cartão recorrente, Pix Automático via parceiro ou boleto; parceiros pendentes.
- Diferenciação dos planos poderá envolver usuários, pedidos mensais, marketing, integrações, personalização e suporte. Limites concretos ainda não definidos.

### Inadimplência e encerramento

Decisão comercial: tenant inadimplente fica inativo; exclusão após 90 dias.

Antes de implementar a exclusão definitiva, definir avisos, exportação, tratamento de pedidos em andamento, retenções legais e descarte em backups. Não interpretar inativação como autorização para interromper o atendimento de pedidos já assumidos sem uma regra operacional definida.

Transferência de propriedade e encerramento precisam de fluxo específico; “padrão de mercado” não define ainda suas regras.

## 3. Tenants, usuários e isolamento

- Cada restaurante é um tenant.
- Um usuário pode ser proprietário ou membro de vários tenants, com cargos diferentes em cada um.
- Não existe uma entidade obrigatória “Empresa” acima dos usuários ou agrupando restaurantes.
- Cada tenant possui catálogo, estoque, equipe, configurações, assinatura e vitrine independentes.
- Não há compartilhamento de dados comerciais entre tenants.
- O comprador acessa a URL da loja; não escolhe a partir de um diretório global.
- Um carrinho e um pedido pertencem a um único tenant.
- Cada loja possui uma única base de entrega inicialmente.
- Endereços previstos: comercial, base de entrega e ponto de retirada. Quantidade de pontos de retirada ainda não definida.
- Cadastro de lojas liberado automaticamente.
- Cadastro aceita pessoa física ou jurídica, com CPF ou CNPJ conforme o caso. Nome, endereço e telefone fazem parte do cadastro; aplicabilidade de razão social e nome fantasia deve respeitar o tipo de pessoa.
- Loja pode pausar vendas manualmente ou por horário.
- Ativação comercial por switch “Loja ativa”. Validações mínimas de publicação ainda precisam ser definidas.

O isolamento entre tenants deve abranger consultas, arquivos, exportações, convites, integrações e ações administrativas; conhecer o ID de um recurso não concede acesso.

## 4. Equipe, permissões e auditoria

### Cargos iniciais

- Proprietário.
- Administrador.
- Atendimento.

Os cargos são predefinidos. Não há criação de cargos personalizados no escopo inicial, mas suas permissões podem receber ajustes por tenant e por membro.

### Regras

- Todas as ações protegidas exigem autorização correspondente.
- Uma permissão explicitamente configurada no membro prevalece sobre a configuração do cargo.
- Acesso restrito aos tenants dos quais o usuário participa.
- Convites por link com validade.
- Nenhuma ação exige aprovação de um segundo usuário inicialmente.
- Permissões incluem preços, cupons, pedidos, reembolsos, financeiro, exportação de clientes, equipe e integrações.
- Poderes exclusivos do proprietário, matriz inicial, validade dos convites e revogação de acessos ainda pendentes.

### Autenticação

- Senha é o mecanismo inicial informado para gestores.
- Autenticação em duas etapas e códigos por telefone/email foram considerados, mas não têm escopo fechado.
- Para compradores: email e senha no início; Google e códigos por WhatsApp/SMS depois.

### Auditoria

A intenção é auditar toda ação relevante. O catálogo de eventos e sua retenção precisam ser detalhados, cobrindo especialmente alterações administrativas, permissões, pedidos, pagamentos, carteira, estoque, exportações e acesso de suporte.

Registros devem identificar ator, tenant, ação e momento, sem registrar senhas, credenciais de parceiros ou dados completos de pagamento.

## 5. Vitrine e experiência de compra

- Site responsivo para comprador e gestão, atendendo celular e computador.
- PWA no MVP; instalação e push são necessidades identificadas. Operação offline não foi solicitada.
- Subdomínio Menuza e domínio próprio da loja.
- Personalização de logo, cores, banners, fontes, ordem das seções, textos, fotos, links sociais e layout.
- A extensão do editor de layout e os limites por plano ainda não estão definidos.
- Páginas institucionais confirmadas: início, produto, contato e políticas.
- Carrinho, checkout e área de conta são necessários aos fluxos confirmados.
- Avaliações somente de produtos, não da loja.
- Exibição de avaliações e informações nutricionais configurável pela loja, respeitando obrigações aplicáveis.
- Ordenação padrão dos produtos definida pelo lojista.
- Exibição de indisponíveis configurável.
- Favoritos no MVP.

### Filtros previstos

Categoria, preço, calorias, proteína, restrição alimentar, ingredientes, peso, disponibilidade e fresco/congelado, conforme dados cadastrados e contexto da loja.

### Pendências visuais

Identidade visual do Menuza, presença da marca nas vitrines, modelos de layout e personalização por plano.

A experiência deve manter navegação por teclado, campos rotulados, contraste legível e comunicação acessível de erros e estados, independentemente das opções de personalização.

## 6. Produtos e complementos

### Cadastro

- Tipos iniciais citados: marmita fresca, marmita congelada, sobremesa e complemento.
- Obrigatórios: nome, descrição, foto e preço.
- Variações como peso/tamanho e proteína.
- Cada variação pode ter preço e estoque próprios.
- Fotos, galerias e vídeos escolhidos pelo lojista; limites pendentes.
- Complementos opcionais gratuitos ou pagos, configurados por produto.
- Regras de quantidade e seleção de complementos ainda precisam ser detalhadas.

### Informação alimentar

- Informações nutricionais por 100 g e por porção foram propostas, mas dependem de revisão regulatória.
- Validade, conservação e preparo podem ser disponibilizados pela loja.
- Não haverá motor operacional distinto apenas por o alimento ser fresco ou congelado no MVP.
- Alergênicos, traços e contaminação cruzada permanecem pendentes.

A configuração comercial da loja não elimina exigências legais aplicáveis ao produto. A definição de campos obrigatórios de informação alimentar exige revisão específica antes do lançamento.

## 7. Kits

Existem **dois modos**, substituindo a premissa inicial de três. O modo “a partir” foi descartado. Não existe categoria especial de “produto premium”.

### 7.1 Pré-selecionado

Grupo de produtos e composição definidos previamente pelo lojista. Regras de substituição pelo comprador ainda não especificadas.

### 7.2 Monte seu kit / cardápio

Lista de produtos elegíveis configurada pelo lojista, com possibilidade de subgrupos. O lojista habilita ou desabilita os itens disponíveis para montagem.

### Regras comuns

- Vários kits ativos por loja, como Emagrecimento, Low Carb e Marmitas de Frango.
- Tamanhos fixos e livres.
- Mínimos e máximos para quantidade de kits, unidades por produto e total de itens.
- Limites por subgrupo/categoria precisam ter sua semântica detalhada.
- Repetição de produto permitida dentro do limite configurado.
- Preço configurável por kit; fórmulas disponíveis ainda precisam ser fechadas.
- Desconto progressivo configurável com faixas de quantidade, percentual e preço final.
- Escopo de contagem do desconto configurável pela loja; opções concretas pendentes.
- Acúmulo de cupons e descontos de kit configurável por loja/campanha.
- Item indisponível pode ser marcado sem estoque ou ocultado/inativado conforme configuração.
- A configuração de indisponibilidade não pode permitir finalizar uma composição que viole seus próprios mínimos.
- Não haverá modelos reutilizáveis de kits inicialmente.

### Estoque

A decisão posterior substitui o estoque próprio do kit montado: **kits descontam as variações escolhidas de seus componentes**.

### Pendências

Comportamento de kit incompleto, mudança de preço entre montagem e pagamento, substituições, limites de quantidade de kits por pedido e alterações após compra. Reembolso parcial está fora do escopo inicial.

## 8. Estoque e operação

- Estoque controlado ou ilimitado por produto/variação.
- No modo controlado, impedir venda além da disponibilidade.
- No modo ilimitado, não impor saldo finito artificial.
- Quando houver variações, definir a precedência entre configuração do produto e da variação.
- Momento da reserva configurável, conforme intenção do fundador; opções e padrão ainda pendentes.
- Reserva, expiração, pagamento e baixa precisam impedir venda concorrente da mesma última unidade.
- Prazo da reserva não deve ser confundido automaticamente com a validade máxima do Pix.
- Sem controle de produção, capacidade fabril, ingredientes, lotes ou validade operacional no MVP.
- Alertas de estoque, etiquetas, substituições e relatórios de cozinha ainda não especificados.

## 9. Conta, carrinho e checkout

- Conta obrigatória por padrão.
- Lojista pode habilitar compra como visitante, mantendo dados de contato necessários à comunicação.
- Disponibilidade de entrega consultada no checkout.
- Carrinho não mistura tenants.
- Pedido não é dividido em múltiplas entregas.
- Pedido para outra pessoa permitido, com destinatário e contato próprios.
- Pedido mínimo configurável por valor, modo de entrega, região e período.
- Loja pode habilitar observação geral, observação de entrega e avisos, como restrições a alterações de pratos.
- Recuperação automática de abandono não entra inicialmente.
- Possibilidade de repetir pedido, com nova validação de preços, estoque e disponibilidade.

### Dados

- Nome, telefone, email e documento fiscal foram solicitados.
- Endereço necessário para entrega.
- Complemento e referência opcionais.
- CPF/CNPJ conforme pessoa física ou jurídica; exigência no checkout e exigências específicas de gateways precisam ser conciliadas.
- Data de nascimento foi solicitada como obrigatória pelo fundador; ver seção de privacidade antes de implementar essa obrigatoriedade.

### Confirmação

O checkout deve apresentar itens e variações, composição dos kits, descontos, frete, uso de carteira, total a pagar, método de pagamento, destinatário e entrega/retirada escolhida antes da confirmação.

## 10. Pagamentos

### Provedores por método

Cada lojista configura provedores distintos para métodos diferentes. Exemplo: Pix no provedor A, cartão no provedor B. Não implica roteamento automático entre múltiplos provedores do mesmo método.

- Dinheiro recebido diretamente pela conta da loja.
- Sem custódia central de pagamentos pelo Menuza como premissa.
- Credenciais e contratos pertencem ao lojista.
- Provedores concretos e capacidades de cada integração ainda não definidos.

### Métodos desejados

Pix, crédito, débito, vale-refeição, vale-alimentação, boleto, dinheiro na entrega e maquininha na entrega. Disponibilidade depende da configuração da loja e do suporte real do provedor.

- Parcelamento configurável pela loja.
- Pagamentos próprios/na entrega podem operar sem API e com conciliação manual do lojista.
- Falha permite tentar novamente ou mudar o método no mesmo pedido.
- Reembolso somente total no MVP.
- Exportação financeira prevista; conciliação avançada e outros módulos financeiros não estão confirmados.
- Documentos fiscais, antifraude e contestação ainda pendentes.

### Pix

- Validade padrão de um dia, encurtada quando necessário para atender ao horário de entrega.
- Expirado permanece no histórico como expirado/não pago.
- Emitir evento de expiração para os canais aplicáveis.
- Regra exata para margem de preparo/despacho e confirmação tardia ainda pendente.

### Pagamento na entrega

- Pedido entra em atendimento antes da confirmação de pagamento.
- Exibir identificação equivalente a “Pendente — pagamento na entrega”.
- Membro autorizado da loja registra recebimento.
- Despacho por ação manual da loja, conforme orientação mais recente, ainda apresentada pelo fundador como preferência provisória.
- Ao registrar pagamento, aplicar as regras de comissão e cashback.

### Integridade financeira

Confirmações repetidas, novas tentativas e notificações duplicadas de gateways não podem duplicar cobrança, baixa, comissão ou cashback. Não confiar no retorno do navegador como confirmação de pagamento.

## 11. Carteira e cashback — MVP

- Carteira recebe cashback e créditos adicionados pelo lojista.
- Não recebe compra de créditos pelo cliente no MVP.
- Cashback calculado sobre o valor final líquido, após frete e descontos, conforme definição do fundador.
- **Pendente:** traduzir “após frete” em fórmula inequívoca: frete incluído na base final ou excluído da base de recompensa.
- Cashback liberado quando o pedido for marcado como pago.
- Saldo pode pagar o pedido inteiro.
- Saldo pode ser combinado com outro método de pagamento.
- Ajustes manuais de saldo exigem permissão e auditoria.

### Regras ainda necessárias

- Percentual/valor de cashback e elegibilidade por loja, produto ou campanha.
- Validade dos créditos.
- Se a parcela paga com saldo gera novo cashback.
- Reserva de saldo durante pagamento misto e liberação em falha/expiração.
- Reversão de cashback em cancelamento ou reembolso, inclusive se o crédito já foi consumido.
- Destino do reembolso de pedido pago com saldo ou pagamento misto.
- Motivo e limites de créditos manuais.
- Isolamento da carteira por tenant e identificação do cliente precisam ser explicitados, sem compartilhar saldo entre lojas por suposição.

A movimentação de carteira deve manter histórico financeiro consistente; alterações de saldo não podem ser simples edições sem registro.

## 12. Entrega e logística

### Terminologia operacional

Para evitar a sobreposição entre “gerenciada”, “externa” e “interna”, este documento descreve capacidades, sem fixar ainda os nomes da interface:

1. **Entrega integrada:** Menuza envia dados ao parceiro via integração; conta do lojista.
2. **Entrega operada pelo lojista:** despacho manual e exportação, inclusive para ferramentas externas.
3. **Retirada:** comprador retira no ponto da loja.

Essas opções podem coexistir. Usar Spoke Dispatch não define, por si só, quem executa o transporte; ele pode receber pedidos por API ou exportação.

- Todas as opções elegíveis devem aparecer ao comprador.
- Uma única base de entrega por tenant.
- Sem entregas fracionadas para um mesmo pedido.
- Endereço não atendido bloqueia entrega e oferece retirada, se estiver ativa e disponível.
- Sem aplicativo ou portal de entregador próprio no escopo inicial.

### Integrações

**MVP: Spoke Dispatch por API e exportação.**  
**Depois: Lalamove.**

- Contas, contratos e credenciais por lojista.
- Ainda não existem acessos comerciais/API confirmados.
- Formato de exportação, endpoints, recursos e permissões comerciais precisam ser verificados antes de prometer automações.
- Despacho integrado solicitado após pagamento.
- Pedido agendado deve preservar sua data/turno ao ser enviado. Envio após pagamento não significa autorizar entrega imediata fora do agendamento.
- Se o parceiro não suportar o fluxo necessário, a adaptação deve ser decidida explicitamente.
- Pagamento na entrega usa despacho manual como direção atual.
- Escolha por menor preço quando houver parceiros comparáveis disponíveis; não é automação útil enquanto existir apenas uma integração elegível.

### Exportações operacionais

Exportar pedidos, incluindo seleção por data/período, para apoiar despacho e operação externa. Campos, formatos e compatibilidade com Spoke ainda pendentes.

### Pendências logísticas

Falha do parceiro, indisponibilidade de entregador, tentativa manual, cancelamento de despacho, rastreamento, comprovante, devolução e nova tentativa. Limites de volume/peso por veículo e cadeia fria também não foram definidos.

## 13. Cobertura e frete

### Cobertura

- Faixas de CEP.
- Raio desde a base.
- Bairros.
- Cidades.

Distância em linha reta no MVP. Distância por rota com OSRM self-hosted fica para depois. Serviço de endereço/geocodificação ainda não escolhido.

### Modelos de preço

1. Taxa fixa.
2. Taxa por faixa de CEP.
3. Taxa por faixa de distância.
4. Valor por quilômetro sobre toda a distância.

Exemplo informado: até 3 km, R$ 8; acima de 3 km até 6 km, R$ 12. Esse exemplo não é uma tabela obrigatória para todas as lojas.

- Entre regras válidas de cobrança, vence o menor valor.
- Isso não autoriza uma regra de preço a ampliar a cobertura permitida.
- Frete grátis por valor mínimo, região ou cupom.
- Valor do carrinho e cupons podem alterar a cobrança.
- Regras pertencem ao tenant.

### Pendências

Precisão e arredondamento da distância, valores monetários, limites inclusivos de faixas, taxa mínima, teto, cotação do parceiro e divergência entre cotação e despacho. Tratamento do frete em reembolso também pendente.

## 14. Agenda e retirada

- Agendado e sob demanda podem ficar ativos simultaneamente.
- Configuração por loja.
- Dias da semana, turnos específicos por dia, feriados e horários especiais.
- Bloqueio de datas e férias.
- Importação de feriados; fonte e abrangência ainda pendentes.
- Sem limite de capacidade por período no MVP.
- Horários de corte configuráveis por dia/turno.
- Haverá valores padrão comuns para facilitar configuração, mas nenhum valor concreto foi aprovado.
- Antecedência mínima e horizonte máximo continuam pendentes; configurabilidade foi discutida sem definição final suficiente.

Também faltam: prazo sob demanda, horários e comprovação de retirada, tolerância de atraso, reagendamento e ausência do destinatário. Não publicar promessa de entrega que o checkout não consiga validar.

## 15. Pedidos e atendimento

### Estados e condições solicitados

Aguardando pagamento, pago, pronto, disponível para retirada, concluído, cancelado, reembolsado e expirado/não pago. Pagamento na entrega deve ser identificável sem bloquear atendimento.

**Direção de implementação recomendada, não máquina de estados final:** separar situação financeira, atendimento e entrega para representar pedido pronto ou concluído ainda não pago.

- Pedidos online aceitos automaticamente após pagamento.
- Pedidos com pagamento na entrega entram em atendimento antes de pagar.
- Loja marca pagamento recebido conforme permissão.
- Repetição de pedido disponível.
- Edição, cancelamento e substituição após pagamento/preparo ainda pendentes.
- Reembolso parcial não entra no MVP.
- A loja é responsável pela venda perante o comprador; responsabilidades contratuais do Menuza e dos parceiros ainda precisam ser formalizadas.

## 16. Cupons e promoções

- Desconto fixo ou percentual.
- Frete grátis.
- Primeira compra.
- Valor mínimo.
- Produtos elegíveis.
- Limite global de usos e por cliente.
- Validade.
- Restrição por modo de entrega.
- Acúmulo entre cupons configurável por cupom.
- Acúmulo com kits, descontos progressivos e frete grátis configurável.

A ordem de aplicação, a base de cada desconto e a precedência quando um cupom permite acúmulo e outro proíbe ainda precisam ser definidas. Totais nunca podem se tornar negativos; limites de uso precisam resistir a compras simultâneas.

## 17. Notificações — MVP

### Canais

- Painel.
- Email.
- Push da PWA.

Lojista e usuários configuram eventos e canais desejados, incluindo preferências da equipe. Preferências não concedem acesso a dados fora das permissões do destinatário.

### Eventos iniciais aceitos

- Novo pedido.
- Pagamento confirmado.
- Pix expirado.
- Pedido pronto.
- Cancelamento.
- Falha de integração.

Destinatários por evento, preferências padrão e distinção entre comunicação transacional e marketing ainda precisam ser definidos. Push depende da permissão do dispositivo e do suporte do navegador; não pode ser o único registro de uma ocorrência operacional.

Automação de atendimento WhatsApp está fora do MVP. WhatsApp/SMS e recuperação automática por WhatsApp/email ficam para fases posteriores.

## 18. Clientes, marketing e indicadores

### MVP

- Gerenciamento de clientes.
- Favoritos.
- Carteira e cashback.
- Cupons.
- Exportação de pedidos, clientes e aniversariantes.
- Dashboard com KPIs.

### Indicadores desejados

Vendas, ticket médio, margem, recompra, conversão, produtos mais vendidos, uso de cupons, pontualidade e cancelamentos.

O dashboard entra no MVP, mas o conjunto efetivamente calculável depende de definir eventos e dados de origem. Margem exige custos; pontualidade exige horários reais; conversão exige definição de sessão/funil. Não apresentar estimativas como métricas comprovadas.

### Integrações desejadas, ainda sem fase fechada

WhatsApp Business, ERP, emissão fiscal, Google Analytics, Meta Pixel, Google Merchant Center e email marketing. Nenhum fornecedor ou escopo específico foi aprovado para estas integrações.

### Depois

- Indicação de amigos.
- Relatórios por IA.
- Recuperação automática de carrinho.
- Assinaturas de refeições e recorrência.

## 19. Assinaturas de refeições — depois do MVP

Diferentes da assinatura SaaS cobrada do lojista.

- Recorrência semanal e mensal.
- Lojista define produtos e kits elegíveis.
- Lojista pode criar assinatura para cliente.
- Cliente pode aderir no checkout.
- Página própria na vitrine para criar, acompanhar e gerenciar assinaturas.

Cobrança, autorização do cliente, escolha de cardápio, pausa, falha de pagamento, cancelamento, estoque e geração de pedidos ainda precisam ser definidos.

## 20. Administração do Menuza e suporte

### Funções

- Gerenciar tenants e recursos habilitados por loja.
- Acompanhar cobranças.
- Atender suporte.
- Acompanhar saúde de integrações.
- Auditar ações.
- Bloquear abuso.
- Acessar a operação da loja para suporte com capacidade administrativa.

O fundador solicita acesso amplo de suporte. Isso deve ser traduzido em acesso operacional autorizado e auditado, não em leitura de senhas, segredos de integração ou dados completos de cartão. Forma de autorização, duração da sessão de suporte e rastreabilidade precisam ser fechadas.

Canais de suporte previstos: central de ajuda, chat e email. SLA e horários ainda não definidos.

## 21. Privacidade, segurança e conformidade

### Data de nascimento e marketing

**Solicitação do fundador:** tornar aniversário/data de nascimento obrigatório para campanhas, conhecimento do cliente, segmentação de anúncios e eventual verificação de idade em lojas que vendam álcool ou similares.

**Pendência de conformidade:** a LGPD não obriga coletar data de nascimento. A obrigatoriedade para marketing não está validada apenas por essas finalidades. É necessário avaliar necessidade, base legal, transparência, direitos do titular e tratamento de dados de crianças/adolescentes antes de implementá-la globalmente.

- Distinguir aniversário (dia/mês) de data completa para aferição etária.
- Distinguir finalidade de compra, marketing, publicidade e eventual verificação de idade.
- Informar nascimento não equivale, por si só, a verificar idade.
- Venda de álcool foi citada como possibilidade; controles e obrigações desse segmento ainda não estão no escopo funcional definido.
- Não presumir consentimento de marketing por criação de conta ou compra.
- Pixels e integrações publicitárias precisam de tratamento de privacidade adequado.

### Outras exigências

- Definir papéis e responsabilidades de Menuza, lojistas e parceiros no tratamento de dados.
- Definir retenção, exportação, exclusão e atendimento de direitos do titular.
- Revisar tratamento de informações alimentares que possam revelar dados de saúde.
- Proteger credenciais de pagamento e logística; não expô-las no storefront, exports ou logs.
- Restringir exportações e acesso de suporte.
- Validar autorizações e valores no servidor em operações financeiras e comerciais.
- Definir backups, testes de restauração, disponibilidade e tolerância à perda de dados.
- Revisar requisitos aplicáveis de informação alimentar, defesa do consumidor e emissão fiscal.

Essas pendências não significam conformidade já garantida nem podem ser resolvidas apenas com um checkbox genérico.

## 22. Escopo de lançamento

### Confirmado no MVP

- Tenants independentes e assinatura por restaurante.
- Membros, cargos predefinidos, permissões e auditoria.
- Vitrine responsiva, personalização, subdomínio e domínio próprio.
- Produtos, variações, complementos e dois modos de kits.
- Estoque controlado/ilimitado e baixa de componentes de kits.
- Conta, carrinho, checkout e gerenciamento de pedidos/clientes.
- Gateways por método e pagamento na entrega.
- Carteira/cashback e pagamentos com saldo ou saldo combinado.
- Cupons e descontos configuráveis.
- Frete por regras, entrega agendada/sob demanda e retirada.
- Spoke Dispatch via API e exportação.
- Exportações de pedidos, clientes e aniversariantes, sujeitas às regras de privacidade.
- Dashboard com KPIs cuja coleta seja definida.
- Favoritos, PWA e notificações em painel/email/push.
- Administração e suporte do Menuza.

### Posterior ou explicitamente fora do MVP

- Lalamove e demais parceiros logísticos além do Spoke Dispatch.
- OSRM self-hosted para distância por rota.
- Assinaturas/recorrência de refeições.
- Indicação e relatórios por IA.
- Automação de atendimento WhatsApp e recuperação automática de carrinho.
- Login Google e códigos WhatsApp/SMS para compradores.
- Produção, ingredientes, lotes e validade operacional.
- Aplicativo de entregador e aplicativos nativos não solicitados.
- Marketplace, carrinho multiloja e divisão de entregas.
- Reembolso parcial.
- Modo de kit “a partir”, produto premium e modelos reutilizáveis de kits.

Funcionalidades discutidas fora dessas listas não entram automaticamente no MVP. A presença de uma integração desejada não confirma sua disponibilidade técnica ou comercial.

## 26. Stack e infraestrutura

Decisões fechadas com o fundador para o MVP. Mudanças precisam de nova rodada.

### Hospedagem e banco

- Infra em VPS na Hetzner/Contabo.
- Postgres em VPS dedicado com réplica de leitura.
- Schema único, sem Row-Level Security. Isolamento por `tenantId` em todas as tabelas de negócio; checagem obrigatória na camada de aplicação (middleware/guard do orpc). Não usar IDs de recurso entre tenants; validação sempre por escopo.

### Backend

- Node + Bun runtime.
- Tipagem end-to-end via **orpc** (typed contracts, OpenAPI exportável, streaming, compressão).
- ORM **Prisma** com Prisma Migrate.
- Sem Tailwind no backend (não há).

### Frontend

- Next.js 16.3 canary mais recente: Server Components, RSC, Cache Components, partial prefetching, App Shell.
- UI: shadcn/ui + Base UI (não Radix).
- Build alinhado ao Bun.

### Auth

- Própria. Hash com argon2.
- Sessões server-side com revogação; refresh por cookies httpOnly + SameSite.
- 2FA, códigos por telefone/email e logins sociais ficam fora do MVP.

### Filas, cache, jobs

- Upstash Redis (ou Redis gerenciado compatível) para cache e BullMQ.
- Workers e cron no mesmo VPS no MVP; separação física só se volume exigir.
- BullMQ scheduled jobs para expiração de Pix, retentativas e notificações assíncronas.
- Idempotência de webhooks por chave do provedor + validação de assinatura HMAC. Reenvio do provedor nunca pode duplicar cobrança, baixa, comissão ou cashback.

### Storage

- S3-compatível (R2 ou Backblaze B2) com CDN (Cloudflare). URLs assinadas por tenant. CDN fornece HTTPS e cache de imagens.

### Email

- SMTP self-hosted para começar. Implementar atrás de uma interface `Mailer` para permitir troca futura para Amazon SES sem refactor amplo. SPF/DKIM/DMARC obrigatórios.

### Pagamentos SaaS

- Asaas para cobrança recorrente, Pix Automático e boleto. Comissionamento do Menuza aplicado via split quando suportado, senão por repasse manual.

### Integrações

- Spoke Dispatch (API + exportação) no MVP; Lalamove depois.
- BrasilAPI para CEP; Nominatim para geocodificação. Distância em linha reta no MVP; OSRM self-hosted só se necessário.
- Gateways de pagamento do lojista ainda em avaliação (Pagar.me, Mercado Pago, PagBank, Efí, AbacatePay, Woovi, Cielo, Asaas).
- Email transacional: ver acima.
- IA para importação de planilhas: fornecedor adiado; avaliar OpenAI/Anthropic/Gemini antes de fechar.

### Observabilidade

- OpenTelemetry para traces.
- Sentry para erros de frontend e backend.
- Logs estruturados com Pino, transporte para Better Stack ou Axiom.
- Auditoria de negócio em tabela dedicada (não só log).

### CI/CD

- GitLab CI: lint, typecheck, `bun test`, build de imagens Docker, deploy automatizado por ambiente.
- Migrations aplicadas via job separado no pipeline, com lock e rollback ensaiado.
- Ambientes: desenvolvimento, staging e produção, em VPS distintos ou namespaces Compose separados.

### Segredos

- Variáveis de ambiente em arquivo `.env` no servidor, com permissões restritas.
- Credenciais por tenant (gateways, SMTP, despacho) criptografadas no banco com chave mestra lida do ambiente.
- Webhooks de parceiros validam HMAC; segredo por integração lido do banco criptografado.

### Testes

- `bun test` para unit e integração.
- Smoke tests contra staging em cada deploy.
- Cenários de aceite definidos na seção 12 cenários acima continuam obrigatórios.

### Repositório

- Monorepo único: `apps/web` (Next), `apps/api` (orpc), `packages/shared` (tipos de domínio e contratos).
- Versionamento atômico de contratos orpc entre api e web.

## 23. Decisões abertas que bloqueiam detalhamento

| Prioridade | Decisão                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Alta       | Fórmula da comissão sobre valor bruto; frete/carteira; cancelamento após pagamento versus reembolso. |
| Alta       | Gateways iniciais, métodos efetivamente suportados e cobrança da assinatura SaaS.                    |
| Alta       | Acesso e capacidades reais do Spoke Dispatch; formato de exportação e agendamento.                   |
| Alta       | Fórmula e validade do cashback; reversões; recompensa sobre uso de saldo; escopo da carteira.        |
| Alta       | Reserva de estoque e saldo; expiração e confirmação tardia de pagamento.                             |
| Alta       | Regras e padrões de agenda, corte, antecedência, retirada e despacho manual.                         |
| Alta       | Máquina de estados e permissões para pagamento, cancelamento e reembolso.                            |
| Alta       | Privacidade de nascimento, publicidade, menores e exclusão após 90 dias.                             |
| Alta       | Matriz de cargos, poderes exclusivos do proprietário e acesso de suporte.                            |
| Média      | Fórmulas de preço/limites de kits e ordem de descontos/cupons.                                       |
| Média      | Destinatários e padrões de notificações.                                                             |
| Média      | Métricas, eventos de origem e campos/formato de exportações.                                         |
| Média      | Limites de planos, módulos, preços anuais e política de uso.                                         |
| Média      | Personalização, avaliações e identidade visual.                                                      |
| Média      | Informação alimentar, documentos fiscais e responsabilidades operacionais.                           |

## 24. Validação e execução

- Não há lojas piloto confirmadas; a resposta atual é não realizar piloto com lojas já selecionadas.
- Não existem metas aprovadas de receita, quantidade de lojas ou métricas de validação.
- Prazo, orçamento, equipe, stack, hospedagem e escala esperada ainda não definidos.
- Migração, onboarding assistido e critérios de prontidão além do switch de ativação ainda pendentes.

### Cenários mínimos de aceite propostos

Esta lista orienta a futura validação; não representa testes já executados.

1. Usuário participa de dois tenants sem acessar dados ou saldo do tenant errado.
2. Override de membro prevalece sobre cargo sem permitir escalar os próprios privilégios indevidamente.
3. Duas compras concorrentes não consomem a mesma última unidade controlada.
4. Kit respeita mínimos/máximos e desconta exatamente seus componentes.
5. Reenvio de confirmação de pagamento não duplica comissão, cashback ou despacho.
6. Pedido com pagamento na entrega entra em atendimento, permite despacho manual e só gera comissão/cashback após recebimento registrado.
7. Pagamento misto não perde saldo em falha e não permite gastar o mesmo saldo duas vezes.
8. Checkout calcula cobertura, menor regra de frete válida, descontos e horário de forma reproduzível.
9. Pedido agendado não é entregue imediatamente por ter sido pago antes da data.
10. Falha de integração fica visível e permite recuperação sem duplicar solicitação logística.
11. Notificações respeitam preferências, permissões e tenant do destinatário.
12. Inativação, exportação e exclusão preservam integridade financeira e obrigações de retenção definidas.

O próximo passo é fechar as decisões de alta prioridade e transformar este escopo em fluxos e critérios de aceite verificáveis, sem assumir recursos adicionais.

## 25. Backlog adicional selecionado pelo fundador

**Classificação aprovada: backlog primeiro.** As escolhas abaixo não ampliam automaticamente o MVP. Integrações são candidatas a pesquisa; capacidades, preços, contratos e disponibilidade não foram verificados.

### Operação

- Ações em lote para pedidos, com validação de permissões e resultado por pedido.
- Fila de exceções para pagamentos, despacho e situações que exigem intervenção.
- Impressão de pedidos e listas operacionais.
- Conferência de separação por checklist.
- Criação manual de pedidos pela loja para vendas recebidas em outros canais.

### Catálogo, migração e IA

- Duplicar produtos e kits dentro do tenant.
- Link compartilhável de carrinho, revalidando preços, estoque e regras no checkout.
- Aviso de reposição solicitado pelo cliente.
- Importação assistida por IA de pedidos, produtos, variantes, cupons e clientes, com prévia dos registros, preços e demais campos antes de confirmar.
- Ambição informada: interpretar dados em “qualquer formato”. Isso não é garantia técnica: formatos, tamanhos, qualidade mínima e limites suportados precisam ser definidos e informados.
- A IA propõe o mapeamento; o sistema valida tipos, valores, vínculos e regras do tenant. Dados ambíguos ou inválidos exigem correção/confirmação, não preenchimento inventado.
- Importação precisa apresentar diferenças, duplicidades e erros antes de gravar. Estratégia de criação/atualização, identificação dos registros e recuperação de falhas ainda pendentes.
- Pedidos históricos importados não devem disparar cobrança, cashback, comissão, notificações ou despacho sem uma regra explícita aprovada para migração.
- Conteúdo de arquivos é dado não confiável, nunca instrução para a IA executar ações ou acessar outros tenants.

**Credenciais na migração — decisão do fundador:** aceitar planilhas que contenham senhas e enviar seu conteúdo à IA, inclusive esses campos quando presentes. Essa decisão substitui a orientação anterior de removê-los antes do envio; não significa que seja seguro ou que a conformidade esteja validada.

**Risco e condições de implementação:** senhas em texto puro são credenciais ativas e podem ser reutilizadas em outros serviços. Seu envio amplia a exposição ao provedor de IA. Antes de habilitar esse fluxo, avaliar autorização para esse tratamento, necessidade, base legal, contrato do provedor, subprocessadores, retenção e eventual transferência internacional. Aviso ao lojista, isoladamente, não resolve essas obrigações. Exigir transporte protegido, acesso restrito, ausência de uso para treinamento e retenção mínima tecnicamente verificável; não registrar senhas em logs, telemetria, prévias ou respostas da IA. Arquivos originais e resultados temporários precisam de política explícita de proteção e descarte.

O envio à IA não autoriza reutilizar essas senhas na autenticação do Menuza. Contas migradas devem usar convite/definição de nova senha; eventual migração de hashes exige avaliação técnica específica e não está aprovada. Quando houver credenciais expostas no arquivo, orientar sua troca e não reproduzi-las na saída da importação. Importação de clientes não presume autorização para marketing.

O uso de IA nesta importação é uma iniciativa distinta de relatórios por IA, que continuam previstos para depois do MVP. Fornecedor, tratamento de dados, retenção e custo por importação estão pendentes.

### Financeiro e implantação

- Extrato detalhado de carteira: créditos, cashback, consumo, ajustes e reversões. Reforça a necessidade de histórico financeiro já descrita; interface e detalhamento entram como candidatos de backlog.
- Limites de cashback por pedido/campanha e regras de elegibilidade/vencimento.
- Checklist de ativação da loja.
- Diagnóstico de integrações, sem exposição de credenciais.
- Histórico de configurações. Restauração automática de versões não foi confirmada.

### Gateways candidatos

| Provedor     | Direção de avaliação                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Asaas        | Métodos disponíveis, cobrança e integração por lojista.                                                                                   |
| Pagar.me     | Pagamentos e vouchers; suporte variado a vouchers foi informado pelo fundador e requer validação por bandeira, contrato e modalidade.     |
| Mercado Pago | Métodos e integração com conta própria de cada loja.                                                                                      |
| PagBank      | Métodos e integração por lojista.                                                                                                         |
| Efí Bank     | Pix e demais capacidades pertinentes.                                                                                                     |
| AbacatePay   | Interesse restrito a Pix e Pix Automático. Taxa fixa de R$ 0,80 mencionada pelo fundador, ainda não verificada nem assumida como vigente. |
| Woovi        | Interesse restrito a Pix e Pix Automático; disponibilidade e condições a verificar.                                                       |
| Cielo        | Métodos, vouchers quando aplicáveis e requisitos de contratação/API.                                                                      |

Distinguir cobrança SaaS do tenant, pagamento avulso do comprador e futura recorrência de refeições. Suporte a Pix não comprova suporte a Pix Automático. A lista não implica implementar todos os provedores no lançamento.

### Integrações operacionais candidatas

- Consulta de CEP e geocodificação; fornecedor a definir.
- Bling: definir fonte oficial de produtos/estoque e direção da sincronização de pedidos.
- Webhooks de saída: eventos por tenant com assinatura, tentativas controladas, identificação para deduplicação e restrição de destinos para evitar acesso indevido à rede interna.

### Comunicação e aquisição candidatas

- Google Analytics 4.
- Meta Pixel e Conversions API, com deduplicação e controles de privacidade.
- Google Merchant Center, conforme elegibilidade e políticas aplicáveis.
- Email: comparar Amazon SES, serviço próprio ou outro provedor de baixo custo. Avaliar custo total, entregabilidade, autenticação de domínio, rejeições e denúncias, não apenas preço por envio.

As três integrações de aquisição já eram desejadas; esta seleção reforça sua avaliação sem promovê-las ao MVP. Email permanece canal confirmado no MVP, mas seu fornecedor continua aberto.

## 27. Pendências técnicas resultantes do stack

- Validar suporte do Prisma ao runtime Bun em produção (driver `pg`/adapter).
- Decidir adapter Postgres para Prisma e impacto em conexões.
- Definir formato do contrato orpc (procedures vs streamable) e estratégia de versionamento de rotas.
- Implementar `Mailer` interface com driver SMTP self-hosted e stub SES.
- Política de lock para migrations em produção (Prisma Migrate + advisory lock).
- Política de retenção e descarte de logs, traces e auditoria (LGPD).
- Plano de disaster recovery para VPS único (snapshots, restore testado).
- Monitoramento do VPS (CPU, RAM, disco, fila BullMQ) e alertas básicos.

## 28. Decisões pós-stack e sequência de execução

### Fechamentos desta rodada

- **Spoke Dispatch bloqueia o MVP.** Antes de começar a integração, validar com o fornecedor: tipo de acesso (API/SDK), latência, limites, recursos de exportação, suporte a agendamento e modelo comercial. Sem validação, logística integrada vira "pós-MVP".
- **Gateway de pedidos do MVP: Asaas** (Pix, Pix Automático, boleto, cartão). Outros provedores (Mercado Pago, PagBank, Cielo, Pagar.me, Efí, Woovi, AbacatePay) entram como gateway secundário configurável por loja no mesmo MVP.
- **Comissão:** base = subtotal de itens. Frete, descontos e uso de carteira não compõem a base.
- **Base de entrega:** 1 por tenant no MVP. Multi-base fica para fase posterior.
- **Agenda:** padrão comum = antecedência mínima 2h, horizonte 14 dias, corte 2h antes do turno. Lojista pode ajustar por turno.
- **Data de nascimento:** declarada obrigatória pelo fundador. LGPD não obriga essa coleta — antes de implementar, avaliar necessidade, base legal, finalidade, transparência e direitos do titular. Se obrigatório, justificar para cada finalidade (marketing, segmentação, verificação de idade).
- **Compra como visitante:** habilitada por padrão; lojista pode desligar. Aumenta conversão e risco de fraude/LGPD; manter log mínimo e exigir consentimento de marketing separado.
- **Piloto:** sem piloto dedicado. Validação pelos 12 cenários de aceite.
- **Critério de pronto do MVP:** os 12 cenários de aceite definidos na seção 12 devem passar, não apenas os cards marcados como Done.

### Sequência de execução proposta

A ordem abaixo respeita dependências críticas. Cada marco libera o seguinte. Tudo segue no Linear (cards MEN-63 a MEN-115).

**Marco 0 — pré-produção (gate)**

- Validar Spoke Dispatch (acesso, API, exportação, agendamento).
- Contrato Asaas fechado e credenciais em produção.
- VPS provisionados (web/api e Postgres) e Caddy configurado.

**Marco 1 — base técnica**

- Monorepo, Docker Compose, Postgres com réplica, Redis, Caddy, OTel+Sentry+Pino, `bun test`, GitLab CI com migrations.
- Modelo de domínio: tenants, usuários, papéis, overrides, auditoria.

**Marco 2 — identidade e permissões**

- Auth própria + argon2.
- Convite por link com validade.
- Matriz de permissões por cargo + override por membro.
- Acesso de suporte auditado.

**Marco 3 — loja e vitrine**

- Cadastro de loja (PF/PJ, ativação por switch).
- Subdomínio + domínio próprio.
- PWA, vitrine responsiva, personalização visual.
- Catálogo: produtos, variações, complementos, estoque controlado/ilimitado.

**Marco 4 — kits e promoções**

- Dois modos de kit (pré-selecionado e monte seu kit).
- Baixa de estoque nas variações escolhidas.
- Cupons (fixo, percentual, frete grátis, primeira compra, mín, validade, limites, acumulação configurável).
- Ordem de aplicação de descontos.

**Marco 5 — checkout e logística (core)**

- Cobertura (CEP, raio, bairro, cidade).
- Frete: fixo, faixa de CEP, faixa de distância, por km.
- Agenda sob demanda + agendado, cortes configuráveis.
- Carrinho e checkout por tenant.
- Pedido mínimo, observações, destinatário separado.
- Integração Asaas para pedidos (Pix, Pix, Automático, cartão, boleto).
- **Gate:** validação Spoke. Se aprovado, despacho integrado pós-pagamento. Se não, exportação CSV e despacho manual.

**Marco 6 — carteira, pedidos e notificações**

- Carteira: cashback sobre subtotal de itens, liberação no pagamento.
- Pedidos: máquina de estados completa, pagamento na entrada, identificador "Pendente — pagamento na entrega".
- Reembolso total e retry no mesmo pedido sem duplicar.
- Notificações: painel, email, push da PWA.
- Auditoria estendida para financeiro, estoque e integrações.

**Marco 7 — admin, cobrança SaaS e prontidão**

- Asaas para cobrança recorrente da assinatura do Menuza (split/manual).
- Planos, comissionamento, 14 dias grátis, inadimplência e exclusão 90 dias.
- Admin: tenants, integrações, auditoria, suporte.
- Dashboard com KPIs cuja coleta esteja definida.
- Exportações com mascaramento de PII.
- Checklists de ativação, diagnóstico de integrações.

**Marco 8 — aceite e go-live**

- Executar os 12 cenários de aceite da seção 12.
- Política de retenção de logs e auditoria (LGPD).
- Plano de DR (snapshots + restore ensaiado).
- Monitoramento VPS + alertas.

### Pós-MVP imediato (cards em MEN-64)

Após go-live, pegar na ordem de prioridade: importador IA (com a política de senhas registrada), gateways secundários, Asaas/Pagar.me/Mercado Pago/PagBank/Cielo, Bling, webhooks, GA4/Meta/Google Merchant Center, ações em lote, fila de exceções, checkout checklist, histórico de configurações, link de carrinho, avise quando voltar, duplicar produtos/kits.

### Fora do MVP (MEN-65)

Lalamove, OSRM self-hosted, assinaturas de refeições, indicação, relatórios por IA, automação WhatsApp, recuperação de carrinho, login social, produção/lotes/validade, reembolso parcial, modo "a partir".
