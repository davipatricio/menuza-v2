/**
 * Public commerce contract. Browser-safe: types and Valibot schemas only.
 * NO server-only imports, NO database access, NO env reads.
 */
import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import * as v from "valibot";
import { sharedErrorCodes } from "../errors/index.ts";

export const healthInput = v.strictObject({});

export const healthOutput = v.object({
  status: v.literal("ok"),
  service: v.literal("commerce"),
  timestamp: v.pipe(v.string(), v.isoTimestamp()),
});

export const commerceContract = oc.errors({
  ...sharedErrorCodes,
  INVALID_INPUT: {
    message: "Entrada inválida.",
    data: v.object({ issues: v.array(v.object({ path: v.string(), message: v.string() })) }),
  },
});

export const health = commerceContract
  .meta(
    openapi({
      method: "GET",
      path: "/health",
      operationId: "getCommerceHealth",
      summary: "Sonda de saúde do serviço de comércio.",
      tags: ["health"],
    }),
  )
  .input(healthInput)
  .output(healthOutput);

/**
 * The storefront's read surface (MEN-260). Tenant comes from the resolved host,
 * never from the client: every input is an empty strict object.
 */

/**
 * The resolved SEO of one page. The same five fields the panel edits: an
 * entity's own override, the store's row and the store templates behind it.
 */
export const publicSeoOutput = v.object({
  title: v.string(),
  description: v.nullable(v.string()),
  socialImageUrl: v.nullable(v.string()),
  canonicalUrl: v.nullable(v.string()),
  jsonLd: v.nullable(v.string()),
});

export const publicStoreOutput = v.object({
  tenantId: v.nullable(v.string()),
  slug: v.string(),
  displayName: v.string(),
  seo: publicSeoOutput,
});

/** One sellable product as the menu renders it. No stock, no cost, no hidden rows. */
export const PublicProductSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.nullable(v.string()),
  imageUrl: v.nullable(v.string()),
  available: v.boolean(),
  archived: v.boolean(),
  sortOrder: v.number(),
  fromPriceCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  variations: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      priceCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
      available: v.boolean(),
    }),
  ),
  tags: v.array(v.string()),
});

/**
 * A published nutrition label. `published` itself never crosses the wire: the
 * read filters and the mapper refuses again, so only a complete, intentionally
 * published row can reach the browser. Measures follow the panel contract:
 * kcal for energy, mg for the rest, thousandths of a gram/mL for the portion.
 */
export const PublicNutritionSchema = v.object({
  basis: v.picklist(["solid", "liquid"]),
  labelFormat: v.picklist(["vertical", "simplified"]),
  source: v.picklist(["manual", "lab", "supplier_label", "database", "estimate"]),
  referenceAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
  energyKcal: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  carbsMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  totalSugarsMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  addedSugarsMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  proteinMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  totalFatMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  saturatedFatMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  transFatMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  fiberMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  sodiumMg: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  portionMilli: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  householdMeasure: v.nullable(v.string()),
  servingsPerPack: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  showHighAddedSugar: v.boolean(),
  showHighSatFat: v.boolean(),
  showHighSodium: v.boolean(),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});

/**
 * The direct-URL product adds the label and its own SEO; the menu listing stays
 * lean, because a card never renders the structured data of its item.
 */
export const PublicProductDetailSchema = v.object({
  ...PublicProductSchema.entries,
  nutrition: v.nullable(PublicNutritionSchema),
  seo: publicSeoOutput,
});

/**
 * The storefront menu is nested three levels deep: department > category >
 * subcategory, with the products last. Departments are ordered by name (they
 * have no `sortOrder` column); categories and subcategories by `sortOrder`, then
 * name. Inactive levels and empty groups are dropped server-side.
 */
export const publicMenuOutput = v.object({
  departments: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      categories: v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          sortOrder: v.number(),
          subcategories: v.array(
            v.object({
              id: v.string(),
              name: v.string(),
              sortOrder: v.number(),
              products: v.array(PublicProductSchema),
            }),
          ),
        }),
      ),
    }),
  ),
  uncategorized: v.array(PublicProductSchema),
});

export const publicSitemapOutput = v.object({
  entries: v.array(
    v.object({
      path: v.string(),
      lastModified: v.pipe(v.string(), v.isoTimestamp()),
      changeFrequency: v.picklist(["daily", "weekly", "monthly"]),
      priority: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    }),
  ),
});

export const getStore = commerceContract
  .meta(
    openapi({
      method: "GET",
      path: "/store",
      operationId: "getPublicStore",
      summary: "Dados públicos da loja do host resolvido, com o SEO já resolvido.",
      tags: ["public"],
    }),
  )
  .input(v.strictObject({}))
  .output(publicStoreOutput);

export const listMenu = commerceContract
  .meta(
    openapi({
      method: "GET",
      path: "/menu",
      operationId: "listPublicMenu",
      summary: "Cardápio público da loja: categorias e produtos vendáveis.",
      tags: ["public"],
    }),
  )
  .input(v.strictObject({}))
  .output(publicMenuOutput);

export const listSitemap = commerceContract
  .meta(
    openapi({
      method: "GET",
      path: "/sitemap",
      operationId: "listPublicSitemap",
      summary: "Entradas de sitemap da loja do host resolvido.",
      tags: ["public"],
    }),
  )
  .input(v.strictObject({}))
  .output(publicSitemapOutput);

/**
 * One product by id, for the direct URL. Hidden products are reachable here;
 * archived ones come back so the page can render the pause notice; an inactive
 * or private product is `null` (the caller decides between 404 and a gate).
 */
export const getProduct = commerceContract
  .meta(
    openapi({
      method: "GET",
      path: "/products/{productId}",
      operationId: "getPublicProduct",
      summary: "Um produto vendável pelo id, para a página de URL direta.",
      tags: ["public"],
    }),
  )
  .input(
    v.strictObject({
      productId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
    }),
  )
  .output(v.object({ product: v.nullable(PublicProductDetailSchema) }));

export const publicContractObject = {
  getStore,
  listMenu,
  getProduct,
  listSitemap,
};

/**
 * Orders (MEN-93, MEN-95, MEN-96, MEN-97).
 *
 * The tenant is never an input: it comes from the resolved host, exactly like
 * the storefront reads, and the caller is a store member resolved from the
 * commerce session. Inputs carry resource identifiers only.
 */
export const CentsSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

const ISOTimestampSchema = v.pipe(v.string(), v.isoTimestamp());

export const FinancialStatusSchema = v.picklist([
  "pending",
  "awaiting_payment",
  "pending_on_delivery",
  "paid",
  "refunded",
  "expired",
  "canceled",
]);

export const FulfilmentStatusSchema = v.picklist([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "canceled",
]);

export const PaymentMethodSchema = v.picklist([
  "pix",
  "credit",
  "debit",
  "meal_voucher",
  "food_voucher",
  "cash_on_delivery",
  "card_on_delivery",
]);

export const OrderAxisSchema = v.picklist(["financial", "fulfilment"]);

export const OrderLineInputSchema = v.strictObject({
  productId: v.optional(v.string()),
  variationId: v.optional(v.string()),
  kitId: v.optional(v.string()),
  name: v.pipe(v.string(), v.nonEmpty()),
  unitPriceCents: CentsSchema,
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
  catalogDiscountCents: v.optional(CentsSchema),
});

export const CreateOrderInputSchema = v.strictObject({
  customerId: v.pipe(v.string(), v.nonEmpty()),
  /** Absent: the server generates a 6-character code. */
  code: v.optional(v.pipe(v.string(), v.nonEmpty())),
  paymentMethod: v.nullable(PaymentMethodSchema),
  shippingCents: CentsSchema,
  walletRequestedCents: CentsSchema,
  lines: v.pipe(v.array(OrderLineInputSchema), v.minLength(1)),
  couponCodes: v.array(v.pipe(v.string(), v.nonEmpty())),
});

export const RejectedCouponSchema = v.object({
  code: v.string(),
  reason: v.string(),
});

/** What checkout returns: the money, both statuses and the coupons that lost. */
export const OrderSummarySchema = v.object({
  id: v.string(),
  code: v.string(),
  subtotalCents: CentsSchema,
  discountCents: CentsSchema,
  shippingCents: CentsSchema,
  walletAppliedCents: CentsSchema,
  cashbackCents: CentsSchema,
  totalCents: CentsSchema,
  financialStatus: FinancialStatusSchema,
  fulfilmentStatus: FulfilmentStatusSchema,
  expiresAt: v.nullable(ISOTimestampSchema),
  rejectedCoupons: v.array(RejectedCouponSchema),
});

export const OrderCodeInputSchema = v.strictObject({
  code: v.pipe(v.string(), v.nonEmpty()),
});

/**
 * What the dashboard may do next, computed with the caller's own capabilities
 * so a `staff` member never sees a refund button they would be refused.
 */
export const AllowedTransitionSchema = v.object({
  axis: OrderAxisSchema,
  to: v.string(),
  capability: v.string(),
  requiresReason: v.boolean(),
});

export const OrderDetailSchema = v.object({
  ...OrderSummarySchema.entries,
  customerId: v.string(),
  paymentMethod: v.nullable(PaymentMethodSchema),
  paidAt: v.nullable(ISOTimestampSchema),
  couponCode: v.nullable(v.string()),
  items: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      unitPriceCents: CentsSchema,
      quantity: v.number(),
      lineTotalCents: CentsSchema,
      optionsLabel: v.nullable(v.string()),
    }),
  ),
  events: v.array(
    v.object({
      id: v.string(),
      type: v.string(),
      fromValue: v.nullable(v.string()),
      toValue: v.nullable(v.string()),
      reason: v.nullable(v.string()),
      createdAt: ISOTimestampSchema,
    }),
  ),
  allowedNextTransitions: v.array(AllowedTransitionSchema),
});

export const TransitionOrderInputSchema = v.strictObject({
  code: v.pipe(v.string(), v.nonEmpty()),
  axis: OrderAxisSchema,
  to: v.pipe(v.string(), v.nonEmpty()),
  reason: v.optional(v.string()),
});

export const TransitionOrderOutputSchema = v.object({
  financialStatus: FinancialStatusSchema,
  fulfilmentStatus: FulfilmentStatusSchema,
});

export const orderContract = oc.errors({
  ...sharedErrorCodes,
  ORDER_TRANSITION_INVALID: {
    message: "Transição de pedido não permitida.",
    data: v.object({ reason: v.string() }),
  },
  REASON_REQUIRED: {
    message: "Esta transição exige um motivo.",
  },
});

export const createOrder = orderContract
  .meta(
    openapi({
      method: "POST",
      path: "/orders",
      operationId: "createOrder",
      summary: "Cria um pedido: precifica as linhas, aplica cupons e reserva a carteira.",
      tags: ["orders"],
    }),
  )
  .input(CreateOrderInputSchema)
  .output(OrderSummarySchema);

export const getOrder = orderContract
  .meta(
    openapi({
      method: "GET",
      path: "/orders/{code}",
      operationId: "getOrder",
      summary: "Um pedido completo, com itens, eventos e as transições permitidas ao chamador.",
      tags: ["orders"],
    }),
  )
  .input(OrderCodeInputSchema)
  .output(OrderDetailSchema);

export const transitionOrder = orderContract
  .meta(
    openapi({
      method: "POST",
      path: "/orders/{code}/transition",
      operationId: "transitionOrder",
      summary: "Move um dos dois eixos do pedido (financeiro ou de preparo).",
      tags: ["orders"],
    }),
  )
  .input(TransitionOrderInputSchema)
  .output(TransitionOrderOutputSchema);

export const recordOrderPayment = orderContract
  .meta(
    openapi({
      method: "POST",
      path: "/orders/{code}/payment",
      operationId: "recordOrderPayment",
      summary: "Registra o recebimento do pedido e credita o cashback uma única vez.",
      tags: ["orders"],
    }),
  )
  .input(OrderCodeInputSchema)
  .output(
    v.object({
      financialStatus: FinancialStatusSchema,
      cashbackCents: CentsSchema,
    }),
  );

export const expireOrder = orderContract
  .meta(
    openapi({
      method: "POST",
      path: "/orders/{code}/expire",
      operationId: "expireOrder",
      summary: "Expira um pedido não pago e devolve a reserva da carteira (uso interno).",
      tags: ["orders"],
    }),
  )
  .input(OrderCodeInputSchema)
  .output(v.object({ financialStatus: FinancialStatusSchema }));

export const ordersContractObject = {
  create: createOrder,
  get: getOrder,
  transition: transitionOrder,
  recordPayment: recordOrderPayment,
  expire: expireOrder,
};

/**
 * Wallet (MEN-92). One wallet per customer per tenant; `balanceCents` is the
 * rollup of the signed `amountCents` entries.
 */
export const walletContract = oc.errors({
  ...sharedErrorCodes,
});

export const WalletTransactionSchema = v.object({
  id: v.string(),
  kind: v.string(),
  amountCents: v.number(),
  orderId: v.nullable(v.string()),
  reason: v.nullable(v.string()),
  createdAt: ISOTimestampSchema,
});

export const getWallet = walletContract
  .meta(
    openapi({
      method: "GET",
      path: "/wallet",
      operationId: "getWallet",
      summary:
        "Saldo e extrato da carteira do cliente, do lançamento mais recente para o mais antigo.",
      tags: ["wallet"],
    }),
  )
  .input(v.strictObject({ customerId: v.pipe(v.string(), v.nonEmpty()) }))
  .output(
    v.object({
      balanceCents: v.number(),
      transactions: v.array(WalletTransactionSchema),
    }),
  );

export const adjustWallet = walletContract
  .meta(
    openapi({
      method: "POST",
      path: "/wallet/adjust",
      operationId: "adjustWallet",
      summary: "Correção manual de saldo feita pela loja (crédito ou débito).",
      tags: ["wallet"],
    }),
  )
  .input(
    v.strictObject({
      customerId: v.pipe(v.string(), v.nonEmpty()),
      amountCents: v.pipe(
        v.number(),
        v.integer(),
        v.check((value) => value !== 0, "O valor não pode ser zero."),
      ),
      reason: v.pipe(v.string(), v.nonEmpty()),
    }),
  )
  .output(v.object({ balanceCents: v.number() }));

export const walletContractObject = {
  get: getWallet,
  adjust: adjustWallet,
};

// Object consumed by `createORPCClient<typeof contract>`.
export const commerceContractObject = {
  health,
  public: publicContractObject,
  orders: ordersContractObject,
  wallet: walletContractObject,
};

export type CommerceRouterContract = typeof commerceContractObject;
