# Menuza

Multi-tenant ecommerce SaaS letting each prepared-meals store run its own storefront, orders, and delivery.

## Language

### Tenancy and access

**Tenant**:
A single restaurant operating its own catalog, stock, team, settings, subscription, and storefront.
_Avoid_: Loja, Restaurante, Empresa, Account

**Member**:
A user participating in a tenant under a role.
_Avoid_: Usuário, Colaborador

**Role**:
A predefined access profile within a tenant.
_Avoid_: Cargo, Perfil

**Membership**:
The link binding a member to a tenant with a role; a member holds one membership per tenant they operate in.
_Avoid_: Vínculo, Associação

**Customer**:
A person buying from a store.
_Avoid_: Comprador, Client, Buyer

**Storefront**:
The buyer-facing shop of a tenant at the store's own address.
_Avoid_: Vitrine, Loja virtual

### Catalog

**Category**:
A store-defined group the catalog is browsed by, such as "Marmitas" or
"Bebidas". A product may sit in at most one category.
_Avoid_: Seção, Aba, Grupo

**Product**:
An item a store sells, with name, description, photo, and price.
_Avoid_: Item, Prato, Marmita (as generic term)

**Variation**:
A selectable variant of a product, such as weight or protein, with its own price and stock.
_Avoid_: Variação, Opção, Tamanho

**Complement**:
An optional add-on configured per product, free or paid.
_Avoid_: Adicional, Extra, Acompanhamento

**Kit**:
A sellable bundle of products with quantity rules and its own pricing.
_Avoid_: Combo, Pack, Cardápio

**Pre-selected kit**:
A kit whose composition is fixed in advance by the store.
_Avoid_: Kit fechado

**Build-your-own kit**:
A kit the buyer composes from store-eligible products within quantity rules.
_Avoid_: Monte seu kit, Kit livre

**Stock**:
The availability of a product or variation, either controlled or unlimited.
_Avoid_: Estoque, Inventory

### Commerce

**Cart**:
The buyer-side selection of items for a single tenant before checkout.
_Avoid_: Carrinho, Cesta, Sacola

**Order**:
A confirmed purchase belonging to a single tenant, never split across tenants or deliveries.
_Avoid_: Pedido, Purchase, Transaction

**Coupon**:
A store-configured discount or free-shipping benefit with eligibility rules.
_Avoid_: Cupom, Promo, Voucher

**Payment method**:
How the buyer pays, such as Pix, card, voucher, slip, or cash on delivery.
_Avoid_: Método, Forma de pagamento

**Payment provider**:
The service account of the store that processes a payment method.
_Avoid_: Gateway, Adquirente, Provedor

**Wallet**:
Per-tenant customer balance holding cashback and store-granted credits.
_Avoid_: Carteira, Saldo

**Cashback**:
Store-granted credit earned from a paid order and usable as wallet balance.
_Avoid_: Recompensa, Pontos

### Logistics

**Delivery base**:
The single origin address of a tenant used for coverage and freight.
_Avoid_: Base de entrega, Origem, Hub

**Coverage**:
The area a store serves, defined by CEP ranges, radius, neighborhoods, or cities.
_Avoid_: Cobertura, Área de entrega

**Freight rule**:
A tenant rule computing the delivery fee from coverage and cart.
_Avoid_: Frete, Taxa de entrega, Shipping

**Pickup**:
Buyer collection of an order at a store point instead of delivery.
_Avoid_: Retirada, Takeaway

### Commercial

**Plan subscription**:
The recurring SaaS contract a store pays per tenant.
_Avoid_: Assinatura, Plano, Membership

**Meal subscription**:
A recurring purchase of meals by a customer, distinct from the SaaS contract.
_Avoid_: Assinatura, Recorrência
