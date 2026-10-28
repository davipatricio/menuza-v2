/**
 * Dashboard (management) contract: staff sessions, store resolution and the
 * panel's read surface.
 *
 * Browser-safe: types and Valibot schemas only. These procedures are the real
 * auth surface for the dashboard (`menuza_tenant_sid` namespace). Login/logout
 * are mutations; everything else is a read.
 *
 * The dashboard does not send a tenant header: every `panel.*` procedure
 * receives the `storeSlug` from the URL and the server resolves
 * `storeSlug -> tenant`, checks the caller's membership and opens the tenant
 * scope (MEN-225).
 *
 * Money crosses the wire as `Int` cents (ADR-0006); the pt-BR formatting and
 * the status labels stay in the UI. Timestamps cross as ISO-8601 strings.
 */
import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import * as v from "valibot";
import { sharedErrorCodes } from "../errors/index.ts";
import { IntegrationStatusSchema } from "./integrations.ts";

export const MemberKindSchema = v.picklist(["human", "bot"]);

export const TenantRoleSchema = v.picklist(["owner", "admin", "staff"]);

/**
 * Slugs that collide with reserved top-level routes (or the demo seeds) and may
 * never become a store address. Shared so the client can block them before the
 * server rejects the request.
 */
export const RESERVED_STORE_SLUGS: readonly string[] = [
  "dashboard",
  "login",
  "signup",
  "store",
  "menu",
  "cart",
  "checkout",
  "api",
  "admin",
  "app",
  "www",
  "about",
  "pricing",
  "contact",
];

/** 3–24 chars, lowercase alphanumerics and hyphen, no hyphen at either end. */
export const StoreSlugSchema = v.pipe(
  v.string(),
  v.regex(
    /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/,
    "Use de 3 a 24 caracteres: letras minúsculas, números e hífen (sem hífen nas pontas).",
  ),
  v.check(
    (slug) => !RESERVED_STORE_SLUGS.includes(slug),
    "Este endereço é reservado. Escolha outro.",
  ),
);

/** 18 is the legal age gate for a management account (MEN-109). */
function isAdult(birthdate: string): boolean {
  const year = Number(birthdate.slice(0, 4));
  const month = Number(birthdate.slice(5, 7));
  const day = Number(birthdate.slice(8, 10));
  const now = new Date();
  const monthNow = now.getUTCMonth() + 1;
  const dayNow = now.getUTCDate();

  const age =
    now.getUTCFullYear() -
    year -
    (monthNow < month || (monthNow === month && dayNow < day) ? 1 : 0);

  return age >= 18;
}

export const SessionMemberSchema = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
  name: v.nullable(v.string()),
  kind: MemberKindSchema,
});

export const SessionMembershipSchema = v.object({
  tenantId: v.string(),
  tenantSlug: v.string(),
  tenantName: v.string(),
  role: TenantRoleSchema,
});

/**
 * Signup onboarding survey (MEN-225). Stored as stable ASCII slugs; the UI maps
 * them to pt-BR labels so the stored values never depend on copy. `persona` is
 * required, `segment`/`referral` are filled only when the member answers them.
 */
export const OnboardingPersonaSchema = v.picklist(["owner", "staff", "exploring", "partner"]);

export const OnboardingSegmentSchema = v.picklist([
  "restaurant",
  "snack",
  "market",
  "sweets",
  "other",
]);

export const OnboardingReferralSchema = v.picklist(["referral", "instagram", "google", "other"]);

export const OnboardingSchema = v.object({
  persona: OnboardingPersonaSchema,
  segment: v.nullable(OnboardingSegmentSchema),
  referral: v.nullable(OnboardingReferralSchema),
});

export const SaveOnboardingInputSchema = v.strictObject({
  persona: OnboardingPersonaSchema,
  segment: v.optional(OnboardingSegmentSchema),
  referral: v.optional(OnboardingReferralSchema),
});

export const LoginInputSchema = v.strictObject({
  email: v.pipe(v.string(), v.nonEmpty(), v.email(), v.maxLength(254)),
  password: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)),
});

export const LoginOutputSchema = v.object({
  member: SessionMemberSchema,
  memberships: v.array(SessionMembershipSchema),
});

export const LogoutOutputSchema = v.object({
  success: v.boolean(),
});

export const CurrentOutputSchema = v.object({
  member: SessionMemberSchema,
  memberships: v.array(SessionMembershipSchema),
  onboarding: v.nullable(OnboardingSchema),
});

export const GetStoreInputSchema = v.strictObject({
  storeSlug: v.pipe(v.string(), v.nonEmpty(), v.maxLength(120)),
});

export const GetStoreOutputSchema = v.object({
  tenantId: v.string(),
  tenantSlug: v.string(),
  tenantName: v.string(),
  role: TenantRoleSchema,
  member: SessionMemberSchema,
});

// --- Panel reads (MEN-225) ---------------------------------------------------
//
// One input shape for every store-scoped read: the slug the dashboard URL
// carries. The server turns it into a tenant and opens the scope; the client
// never sends a tenantId.

/**
 * Mirrors the contract's `financial_status` enum (MEN-93 split the old
 * single-axis `order_status`). The UI owns the pt-BR labels.
 */
export const FinancialStatusSchema = v.picklist([
  "pending",
  "awaiting_payment",
  "pending_on_delivery",
  "paid",
  "refunded",
  "expired",
  "canceled",
]);

/** Mirrors the contract's `fulfilment_status` enum (MEN-93). */
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

/** Mirrors the contract's `payment_method` enum. */
export const PaymentMethodSchema = v.picklist([
  "pix",
  "credit",
  "debit",
  "meal_voucher",
  "food_voucher",
  "boleto",
  "cash_on_delivery",
  "card_on_delivery",
]);

/** Mirrors the contract's `payment_provider` enum. */
export const PaymentProviderSchema = v.picklist(
  ["pagarme", "offline"],
  "Escolha um provedor válido.",
);

/** Mirrors the contract's `payment_integration_status` enum. */
export const PaymentIntegrationStatusSchema = v.picklist(["active", "disabled"]);

/** Mirrors the contract's `stock_mode` enum (MEN-81). */
export const StockModeSchema = v.picklist(["controlled", "unlimited"]);

/** Mirrors the contract's `discount_type` enum (MEN-97). */
export const DiscountTypeSchema = v.picklist(
  ["percentage", "fixed"],
  "Escolha o tipo de desconto.",
);

/** Mirrors the contract's `coupon_status` enum. */
export const CouponStatusSchema = v.picklist(
  ["active", "expired", "disabled"],
  "Escolha um status válido.",
);

export const PanelStoreInputSchema = v.strictObject({
  storeSlug: v.pipe(v.string(), v.nonEmpty(), v.maxLength(120)),
});

export const PanelOrderIdInputSchema = v.strictObject({
  storeSlug: v.pipe(v.string(), v.nonEmpty(), v.maxLength(120)),
  orderCode: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
});

export const PanelCustomerIdInputSchema = v.strictObject({
  storeSlug: v.pipe(v.string(), v.nonEmpty(), v.maxLength(120)),
  customerId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
});

/**
 * One order row as the panel's tables render it. Money is Int cents and the
 * two status axes are independent (MEN-93); `paidAt`/`expiresAt` are optional
 * timestamps, so they cross as null rather than being omitted.
 */
export const PanelOrderSchema = v.object({
  id: v.string(),
  code: v.string(),
  customerId: v.string(),
  customerName: v.string(),
  subtotalCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  discountCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  shippingCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  walletAppliedCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  cashbackCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  totalCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  financialStatus: FinancialStatusSchema,
  fulfilmentStatus: FulfilmentStatusSchema,
  paymentMethod: v.nullable(PaymentMethodSchema),
  paidAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
  expiresAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
});

/** One line of an order, with the name and price copied at checkout time. */
export const PanelOrderItemSchema = v.object({
  id: v.string(),
  name: v.string(),
  unitPriceCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
  lineTotalCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  optionsLabel: v.nullable(v.string()),
});

/**
 * One row of the append-only order trail. `type` stays free text so a new event
 * the contract documents does not break an older panel; the UI owns the pt-BR
 * labels. `actorName` is the member who performed it, `null` for the machine.
 */
export const PanelOrderEventSchema = v.object({
  id: v.string(),
  type: v.string(),
  fromValue: v.nullable(v.string()),
  toValue: v.nullable(v.string()),
  reason: v.nullable(v.string()),
  actorName: v.nullable(v.string()),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const PanelOrderDetailSchema = v.object({
  ...PanelOrderSchema.entries,
  items: v.array(PanelOrderItemSchema),
  events: v.array(PanelOrderEventSchema),
});

export const PanelOrdersOutputSchema = v.object({
  orders: v.array(PanelOrderSchema),
});

export const PanelOrderOutputSchema = v.object({
  order: PanelOrderDetailSchema,
});

/**
 * The optional filters the board narrows by. They are part of the input rather
 * than a separate procedure so the existing `{ storeSlug }` call keeps working.
 */
export const PanelOrdersInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  financialStatus: v.optional(FinancialStatusSchema),
  fulfilmentStatus: v.optional(FulfilmentStatusSchema),
  paymentMethod: v.optional(PaymentMethodSchema),
});

/** `refunded`, `expired` and `canceled` are the terminal money states. */
export const OrderAxisSchema = v.picklist(["financial", "fulfilment"]);

/**
 * One legal move out of the order's current state, already filtered by the
 * caller's capabilities — the dashboard renders these and nothing else.
 */
export const PanelOrderTransitionSchema = v.object({
  axis: OrderAxisSchema,
  to: v.string(),
  requiresReason: v.boolean(),
});

export const PanelOrderTransitionsOutputSchema = v.object({
  transitions: v.array(PanelOrderTransitionSchema),
});

/** What a mutation returns: both axes plus the moves that are still legal. */
export const PanelOrderStateOutputSchema = v.object({
  financialStatus: FinancialStatusSchema,
  fulfilmentStatus: FulfilmentStatusSchema,
  transitions: v.array(PanelOrderTransitionSchema),
});

export const PanelOrderTransitionInputSchema = v.object({
  ...PanelOrderIdInputSchema.entries,
  axis: OrderAxisSchema,
  to: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
  reason: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

/** A customer plus the totals derived from their orders in this store. */
export const PanelCustomerSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  phone: v.string(),
  ordersCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  totalSpentCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const PanelCustomerDetailSchema = v.object({
  customer: PanelCustomerSchema,
  orders: v.array(PanelOrderSchema),
});

export const PanelCustomersOutputSchema = v.object({
  customers: v.array(PanelCustomerSchema),
});

export const PanelCustomerOutputSchema = PanelCustomerDetailSchema;

/** A catalog product with the price of its default variation (MEN-80). */
export const PanelProductTagSchema = v.object({
  id: v.string(),
  name: v.string(),
});

/** What the panel and the storefront both render: the image is the whole point. */
export const ProductBadgeRefSchema = v.object({
  id: v.string(),
  name: v.string(),
  imageUrl: v.string(),
});

export const PanelProductSchema = v.object({
  id: v.string(),
  name: v.string(),
  categoryId: v.nullable(v.string()),
  categoryName: v.nullable(v.string()),
  subcategoryId: v.nullable(v.string()),
  subcategoryName: v.nullable(v.string()),
  departmentIds: v.array(v.string()),
  departmentNames: v.array(v.string()),
  tags: v.array(PanelProductTagSchema),
  badges: v.array(ProductBadgeRefSchema),
  priceCents: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  available: v.boolean(),
  archived: v.boolean(),
  hidden: v.boolean(),
  private: v.boolean(),
  sortOrder: v.pipe(v.number(), v.integer(), v.minValue(0)),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});

/**
 * The list row adds what the table needs to avoid one detail request per row:
 * the price window across variations and the stock summary.
 */
export const PanelProductListSchema = v.object({
  ...PanelProductSchema.entries,
  description: v.nullable(v.string()),
  seoTitle: v.nullable(v.string()),
  seoDescription: v.nullable(v.string()),
  variationNames: v.array(v.string()),
  variationCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  priceMinCents: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  priceMaxCents: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  stockQty: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  hasUnlimitedStock: v.boolean(),
});

export const PanelProductsOutputSchema = v.object({
  products: v.array(PanelProductListSchema),
});

// --- Catalog writes ----------------------------------------------------------
//
// The list shape above is unchanged; the detail adds the fields only the editor
// needs (description, every variation with its stock) on top of it.

export const PanelProductVariationSchema = v.object({
  id: v.string(),
  name: v.string(),
  priceCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  stockMode: StockModeSchema,
  stockQty: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

export const NutritionBasisSchema = v.picklist(
  ["solid", "liquid"],
  "Escolha a base da tabela nutricional.",
);

export const NutritionLabelFormatSchema = v.picklist(
  ["vertical", "simplified"],
  "Escolha o formato da tabela nutricional.",
);

export const NutritionSourceSchema = v.picklist([
  "manual",
  "lab",
  "supplier_label",
  "database",
  "estimate",
]);

const nutritionNumber = v.pipe(
  v.number("Informe um número válido."),
  v.integer("Use um número inteiro."),
  v.minValue(0, "O valor não pode ser negativo."),
);

const nutritionPositive = v.pipe(
  v.number("Informe um número válido."),
  v.integer("Use um número inteiro."),
  v.minValue(1, "O valor deve ser maior que zero."),
);

/**
 * The label the editor and the storefront render. Nutrients are stored per
 * 100 g/mL as integers in the smallest unit the table declares: kcal for
 * energy, mg for the rest. Portion is thousandths of a gram or millilitre.
 * `%VD` and the "Alto em" recommendation are derived, never stored.
 */
export const PanelProductNutritionSchema = v.object({
  basis: NutritionBasisSchema,
  labelFormat: NutritionLabelFormatSchema,
  source: NutritionSourceSchema,
  referenceAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
  energyKcal: v.nullable(nutritionNumber),
  carbsMg: v.nullable(nutritionNumber),
  totalSugarsMg: v.nullable(nutritionNumber),
  addedSugarsMg: v.nullable(nutritionNumber),
  proteinMg: v.nullable(nutritionNumber),
  totalFatMg: v.nullable(nutritionNumber),
  saturatedFatMg: v.nullable(nutritionNumber),
  transFatMg: v.nullable(nutritionNumber),
  fiberMg: v.nullable(nutritionNumber),
  sodiumMg: v.nullable(nutritionNumber),
  portionMilli: v.nullable(nutritionPositive),
  householdMeasure: v.nullable(v.string()),
  servingsPerPack: v.nullable(nutritionPositive),
  showHighAddedSugar: v.boolean(),
  showHighSatFat: v.boolean(),
  showHighSodium: v.boolean(),
  published: v.boolean(),
  notes: v.nullable(v.string()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const PanelProductDetailSchema = v.object({
  ...PanelProductSchema.entries,
  description: v.nullable(v.string()),
  variations: v.array(PanelProductVariationSchema),
  nutrition: v.nullable(PanelProductNutritionSchema),
});

export const PanelProductOutputSchema = v.object({
  product: PanelProductDetailSchema,
});

/** `deleteProduct` and the taxonomy writes report the mutation only. */
export const PanelSuccessOutputSchema = v.object({ success: v.boolean() });

/**
 * The one stock rule a variation can break: `controlled` needs a quantity,
 * `unlimited` must not carry one. Shared so the form can show the message under
 * the field instead of only after a round trip.
 */
export function stockQtyIssue(stockMode: StockMode, stockQty: number | null): string | null {
  if (stockMode === "controlled" && stockQty === null) {
    return "Informe a quantidade em estoque.";
  }

  if (stockMode === "unlimited" && stockQty !== null) {
    return "Produto sem controle de estoque não deve ter quantidade.";
  }

  return null;
}

export const ProductVariationInputSchema = v.pipe(
  v.strictObject({
    /** Present when the row already exists; omitted inserts a new variation. */
    id: v.optional(
      v.pipe(v.string("Variação inválida."), v.nonEmpty("Variação inválida."), v.maxLength(64)),
    ),
    name: v.pipe(
      v.string("Informe o nome da variação."),
      v.trim(),
      v.nonEmpty("Informe o nome da variação."),
      v.maxLength(80, "Use no máximo 80 caracteres."),
    ),
    priceCents: v.pipe(
      v.number("Informe um preço válido."),
      v.integer("Use um número inteiro."),
      v.minValue(0, "O valor mínimo é 0."),
    ),
    stockMode: StockModeSchema,
    stockQty: v.nullable(
      v.pipe(
        v.number("Informe uma quantidade válida."),
        v.integer("Use um número inteiro."),
        v.minValue(0, "O valor mínimo é 0."),
      ),
    ),
  }),
  v.forward(
    v.check(
      (variation) => stockQtyIssue(variation.stockMode, variation.stockQty) === null,
      "Quantidade em estoque incompatível com o modo de estoque.",
    ),
    ["stockQty"],
  ),
);

const catalogStoreSlug = v.pipe(
  v.string("Loja inválida."),
  v.nonEmpty("Loja inválida."),
  v.maxLength(120, "Loja inválida."),
);

const catalogProductId = v.pipe(
  v.string("Produto inválido."),
  v.nonEmpty("Produto inválido."),
  v.maxLength(64, "Produto inválido."),
);

const catalogSortOrder = v.pipe(
  v.number("Informe uma ordem válida."),
  v.integer("Use um número inteiro."),
  v.minValue(0, "O valor mínimo é 0."),
);

const catalogNullableId = (message: string) =>
  v.nullable(v.pipe(v.string(message), v.nonEmpty(message), v.maxLength(64, message)));

const productName = v.pipe(
  v.string("Informe o nome do produto."),
  v.trim(),
  v.nonEmpty("Informe o nome do produto."),
  v.maxLength(120, "Use no máximo 120 caracteres."),
);

const productDescription = v.nullable(
  v.pipe(v.string("Descrição inválida."), v.maxLength(2000, "Use no máximo 2000 caracteres.")),
);

const productSubcategoryId = catalogNullableId("Subcategoria inválida.");

const productTagIds = v.array(
  v.pipe(v.string("Tag inválida."), v.nonEmpty("Tag inválida."), v.maxLength(64, "Tag inválida.")),
);

const productVariations = v.pipe(
  v.array(ProductVariationInputSchema),
  v.minLength(1, "Informe ao menos uma variação."),
  v.maxLength(50, "Use no máximo 50 variações."),
);

export const CreateProductInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  name: productName,
  description: productDescription,
  subcategoryId: productSubcategoryId,
  tagIds: productTagIds,
  badgeIds: v.optional(v.array(v.string())),
  available: v.boolean(),
  archived: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
  private: v.optional(v.boolean()),
  sortOrder: catalogSortOrder,
  variations: productVariations,
});

/**
 * A partial update: an omitted field leaves the stored value untouched, while
 * `null` still clears the nullable ones. Only the addressing is required.
 */
export const UpdateProductInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  productId: catalogProductId,
  name: v.optional(productName),
  description: v.optional(productDescription),
  subcategoryId: v.optional(productSubcategoryId),
  tagIds: v.optional(productTagIds),
  badgeIds: v.optional(v.array(v.string())),
  available: v.optional(v.boolean()),
  archived: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
  private: v.optional(v.boolean()),
  sortOrder: v.optional(catalogSortOrder),
  variations: v.optional(productVariations),
});

/** `getProduct` and `deleteProduct` share the exact same addressing. */
export const ProductIdInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  productId: catalogProductId,
});

const nutritionValuePatch = v.optional(v.nullable(nutritionNumber));

/**
 * A partial save, like `updateProduct`: an omitted field keeps the stored
 * value, `null` clears it. Publishing is validated on the merged row by the
 * server, because a patch may leave the required fields out on purpose.
 */
export const SaveProductNutritionInputSchema = v.pipe(
  v.strictObject({
    ...ProductIdInputSchema.entries,
    basis: v.optional(NutritionBasisSchema),
    labelFormat: v.optional(NutritionLabelFormatSchema),
    source: v.optional(NutritionSourceSchema),
    referenceAt: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp()))),
    energyKcal: nutritionValuePatch,
    carbsMg: nutritionValuePatch,
    totalSugarsMg: nutritionValuePatch,
    addedSugarsMg: nutritionValuePatch,
    proteinMg: nutritionValuePatch,
    totalFatMg: nutritionValuePatch,
    saturatedFatMg: nutritionValuePatch,
    transFatMg: nutritionValuePatch,
    fiberMg: nutritionValuePatch,
    sodiumMg: nutritionValuePatch,
    portionMilli: v.optional(v.nullable(nutritionPositive)),
    householdMeasure: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(80)))),
    servingsPerPack: v.optional(v.nullable(nutritionPositive)),
    showHighAddedSugar: v.optional(v.boolean()),
    showHighSatFat: v.optional(v.boolean()),
    showHighSodium: v.optional(v.boolean()),
    published: v.optional(v.boolean()),
    notes: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
  }),
  v.check((input) => {
    if (input.addedSugarsMg === undefined || input.addedSugarsMg === null) return true;

    if (input.totalSugarsMg === undefined || input.totalSugarsMg === null) return true;

    return input.addedSugarsMg <= input.totalSugarsMg;
  }, "Açúcares adicionados não podem passar dos açúcares totais."),
  v.check((input) => {
    const saturated = input.saturatedFatMg;
    const trans = input.transFatMg;
    const total = input.totalFatMg;

    if (saturated === undefined || saturated === null) return true;

    if (trans === undefined || trans === null) return true;

    if (total === undefined || total === null) return true;

    return saturated + trans <= total;
  }, "Saturadas e trans não podem passar das gorduras totais."),
);

export const DeleteProductInputSchema = ProductIdInputSchema;

const bulkProductIds = v.pipe(
  v.array(catalogProductId),
  v.minLength(1, "Selecione ao menos um produto."),
  v.maxLength(500, "Selecione no máximo 500 produtos por vez."),
);

/**
 * One round trip for the table's bulk bar. Every field is optional, but at
 * least one has to be present; tags are added, never replaced, so selecting a
 * product that already has one is a no-op for that pair.
 */
export const BulkUpdateProductsInputSchema = v.pipe(
  v.strictObject({
    storeSlug: catalogStoreSlug,
    productIds: bulkProductIds,
    available: v.optional(v.boolean()),
    addTagIds: v.optional(productTagIds),
    subcategoryId: v.optional(productSubcategoryId),
  }),
  v.check(
    (input) =>
      input.available !== undefined ||
      input.addTagIds !== undefined ||
      input.subcategoryId !== undefined,
    "Informe ao menos uma alteração.",
  ),
);

export const BulkUpdateProductsOutputSchema = v.object({
  updated: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const BulkDeleteProductsInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  productIds: bulkProductIds,
});

/** Protected products are skipped instead of failing the whole selection. */
export const BulkDeleteProductsOutputSchema = v.object({
  deleted: v.pipe(v.number(), v.integer(), v.minValue(0)),
  skipped: v.array(v.object({ id: v.string(), name: v.string() })),
});

export const PanelCategorySchema = v.object({
  id: v.string(),
  name: v.string(),
  active: v.boolean(),
  sortOrder: v.pipe(v.number(), v.integer(), v.minValue(0)),
  itemsCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
  departmentIds: v.array(v.string()),
  departmentNames: v.array(v.string()),
});

export const PanelSubcategorySchema = v.object({
  id: v.string(),
  name: v.string(),
  categoryId: v.string(),
  categoryName: v.string(),
  active: v.boolean(),
  sortOrder: v.pipe(v.number(), v.integer(), v.minValue(0)),
  itemsCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const PanelKitSchema = v.object({
  id: v.string(),
  name: v.string(),
  mode: v.string(),
  available: v.boolean(),
  itemsCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const PanelKitsOutputSchema = v.object({
  kits: v.array(PanelKitSchema),
});

export const PanelCategoriesOutputSchema = v.object({
  categories: v.array(PanelCategorySchema),
});

export const PanelSubcategoriesOutputSchema = v.object({
  subcategories: v.array(PanelSubcategorySchema),
});

export const PanelDepartmentSchema = v.object({
  id: v.string(),
  name: v.string(),
  active: v.boolean(),
  itemsCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const PanelDepartmentsOutputSchema = v.object({
  departments: v.array(PanelDepartmentSchema),
});

export const PanelTagSchema = v.object({
  id: v.string(),
  name: v.string(),
  isActive: v.boolean(),
  itemsCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const PanelTagsOutputSchema = v.object({
  tags: v.array(PanelTagSchema),
});

export const PanelBadgeSchema = v.object({
  id: v.string(),
  name: v.string(),
  imageUrl: v.string(),
  sortOrder: v.pipe(v.number(), v.integer(), v.minValue(0)),
  isActive: v.boolean(),
  itemsCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const PanelBadgesOutputSchema = v.object({
  badges: v.array(PanelBadgeSchema),
});

// --- Taxonomy list inputs ----------------------------------------------------
//
// The dashboard writes its filters, sort and order to the URL, so the server
// receives them as input. Every key is optional with a default, which keeps the
// earlier `{ storeSlug }` callers validating unchanged.

const taxonomyQuery = v.optional(v.pipe(v.string(), v.maxLength(120)), "");

const taxonomyStatus = v.optional(v.picklist(["all", "active", "inactive"]), "all");

const taxonomyOrder = v.optional(v.picklist(["asc", "desc"]), "asc");

/** Empty means "all" for the two relational filters. */
const taxonomyFilterId = v.optional(v.pipe(v.string(), v.maxLength(64)), "");

export const ListDepartmentsInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  q: taxonomyQuery,
  status: taxonomyStatus,
  sortBy: v.optional(v.picklist(["name", "itemsCount", "updatedAt"]), "name"),
  order: taxonomyOrder,
});

export const ListCategoriesInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  q: taxonomyQuery,
  status: taxonomyStatus,
  departmentId: taxonomyFilterId,
  sortBy: v.optional(v.picklist(["name", "itemsCount", "updatedAt", "sortOrder"]), "sortOrder"),
  order: taxonomyOrder,
});

export const ListSubcategoriesInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  q: taxonomyQuery,
  status: taxonomyStatus,
  categoryId: taxonomyFilterId,
  sortBy: v.optional(v.picklist(["name", "itemsCount", "updatedAt", "sortOrder"]), "sortOrder"),
  order: taxonomyOrder,
});

export const ListProductsInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  sortBy: v.optional(
    v.picklist(["sortOrder", "name", "updatedAt", "price", "category", "stock"]),
    "sortOrder",
  ),
  order: taxonomyOrder,
});

export const ListTagsInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  sortBy: v.optional(v.picklist(["name", "itemsCount"]), "name"),
  order: taxonomyOrder,
});

// --- Taxonomy writes ---------------------------------------------------------
//
// Categories keep a name and a sort order; departments carry a name and an
// active flag — they have no ordering; tags carry a name and an active flag.

const taxonomyName = v.pipe(
  v.string("Informe o nome."),
  v.trim(),
  v.nonEmpty("Informe o nome."),
  v.maxLength(80, "Use no máximo 80 caracteres."),
);

const taxonomyId = (message: string) =>
  v.pipe(v.string(message), v.nonEmpty(message), v.maxLength(64, message));

const categoryDepartmentIds = v.array(taxonomyId("Departamento inválido."));

export const CreateCategoryInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  name: taxonomyName,
  sortOrder: catalogSortOrder,
  active: v.boolean(),
  departmentIds: categoryDepartmentIds,
});

export const UpdateCategoryInputSchema = v.strictObject({
  ...CreateCategoryInputSchema.entries,
  categoryId: taxonomyId("Categoria inválida."),
});

export const DeleteCategoryInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  categoryId: taxonomyId("Categoria inválida."),
});

export const CreateSubcategoryInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  name: taxonomyName,
  categoryId: taxonomyId("Categoria inválida."),
  sortOrder: catalogSortOrder,
  active: v.boolean(),
});

export const UpdateSubcategoryInputSchema = v.strictObject({
  ...CreateSubcategoryInputSchema.entries,
  subcategoryId: taxonomyId("Subcategoria inválida."),
});

export const DeleteSubcategoryInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  subcategoryId: taxonomyId("Subcategoria inválida."),
});

export const CreateDepartmentInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  name: taxonomyName,
  active: v.boolean(),
});

export const UpdateDepartmentInputSchema = v.strictObject({
  ...CreateDepartmentInputSchema.entries,
  departmentId: taxonomyId("Departamento inválido."),
  /** Products move here in the same transaction when the department is deactivated. */
  moveProductsToCategoryId: v.optional(v.nullable(taxonomyId("Categoria inválida."))),
});

export const DeleteDepartmentInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  departmentId: taxonomyId("Departamento inválido."),
});

export const CreateTagInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  name: taxonomyName,
  isActive: v.boolean(),
});

export const UpdateTagInputSchema = v.strictObject({
  ...CreateTagInputSchema.entries,
  tagId: taxonomyId("Tag inválida."),
});

export const DeleteTagInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  tagId: taxonomyId("Tag inválida."),
});

const badgeName = v.pipe(
  v.string("Informe o nome da etiqueta."),
  v.trim(),
  v.nonEmpty("Informe o nome da etiqueta."),
  v.maxLength(64, "Use no máximo 64 caracteres."),
);

/** Absolute http(s) only: the storefront renders it as-is, so no `data:` or `javascript:`. */
const BADGE_IMAGE_URL_MESSAGE = "Use uma URL completa (http:// ou https://).";

const badgeImageUrl = v.pipe(
  v.string("Informe a URL da imagem."),
  v.trim(),
  v.nonEmpty("Informe a URL da imagem."),
  v.maxLength(1000, "Use no máximo 1000 caracteres."),
  v.url(BADGE_IMAGE_URL_MESSAGE),
  v.regex(/^https?:\/\//i, BADGE_IMAGE_URL_MESSAGE),
);

const catalogBadgeId = v.pipe(
  v.string("Etiqueta inválida."),
  v.nonEmpty("Etiqueta inválida."),
  v.maxLength(64, "Etiqueta inválida."),
);

export const CreateBadgeInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  name: badgeName,
  imageUrl: badgeImageUrl,
  sortOrder: v.optional(catalogSortOrder),
  isActive: v.optional(v.boolean()),
});

export const UpdateBadgeInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  badgeId: catalogBadgeId,
  name: v.optional(badgeName),
  imageUrl: v.optional(badgeImageUrl),
  sortOrder: v.optional(catalogSortOrder),
  isActive: v.optional(v.boolean()),
});

export const DeleteBadgeInputSchema = v.strictObject({
  storeSlug: catalogStoreSlug,
  badgeId: catalogBadgeId,
});

/** `valueCents` is set only for a fixed discount; percentages carry `valuePercent`. */
export const PanelCouponSchema = v.object({
  id: v.string(),
  code: v.string(),
  description: v.nullable(v.string()),
  discountType: DiscountTypeSchema,
  valueCents: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  valuePercent: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
  usageCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  usageLimit: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  perCustomerLimit: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  minimumOrderCents: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  maximumDiscountCents: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  shippingDiscountPercent: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  ),
  startsAt: v.nullable(v.string()),
  endsAt: v.nullable(v.string()),
  stackable: v.boolean(),
  firstPurchaseOnly: v.boolean(),
  status: CouponStatusSchema,
});

export const PanelCouponsOutputSchema = v.object({
  coupons: v.array(PanelCouponSchema),
});

/** `action` stays free text until MEN-74 closes the event catalog. */
export const PanelAuditLogSchema = v.object({
  id: v.string(),
  action: v.string(),
  actor: v.string(),
  target: v.string(),
  ip: v.string(),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const PanelAuditLogsOutputSchema = v.object({
  logs: v.array(PanelAuditLogSchema),
});

export const RegisterNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(2, "Informe seu nome."),
  v.maxLength(120, "O nome deve ter no máximo 120 caracteres."),
);

export const RegisterEmailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.email("Informe um e-mail válido."),
  v.maxLength(254),
);

export const RegisterBirthdateSchema = v.pipe(
  v.string(),
  v.isoDate("Informe uma data válida (AAAA-MM-DD)."),
  v.check(isAdult, "É preciso ter 18 anos ou mais para criar uma conta."),
);

export const RegisterPasswordSchema = v.pipe(
  v.string(),
  v.minLength(8, "A senha deve ter ao menos 8 caracteres."),
  v.maxLength(200),
);

export const RegisterInputSchema = v.strictObject({
  name: RegisterNameSchema,
  email: RegisterEmailSchema,
  birthdate: RegisterBirthdateSchema,
  password: RegisterPasswordSchema,
});

export const RegisterOutputSchema = LoginOutputSchema;

// --- Account: password and sessions (MEN-225) ---------------------------------
//
// Member-level, not store-level: a management account outlives any single
// store, so these take no `storeSlug` and the dashboard serves them at
// `/dashboard/settings/account`. Only the `tenant` namespace appears here — the
// commerce session is buyer-facing and belongs to the addresses ticket.

/**
 * Reusing a password is the one thing a password-change form can check without
 * the database, and it is where most "changed it to the same thing" bugs live.
 */
export const ChangePasswordInputSchema = v.strictObject({
  currentPassword: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)),
  newPassword: RegisterPasswordSchema,
});

export const ChangePasswordOutputSchema = v.object({
  /** False when the same password was submitted; nothing is revoked. */
  changed: v.boolean(),
});

/**
 * One live session. `current` marks the caller's own row — the client hides its
 * "revoke" button rather than offering a self-revoke that just logs you out.
 * The row `id` is the SHA-256 digest, never the bearer token, so it is safe to
 * display and to send back for revocation.
 */
export const ActiveSessionSchema = v.object({
  id: v.string(),
  current: v.boolean(),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  lastUsedAt: v.pipe(v.string(), v.isoTimestamp()),
  expiresAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const ActiveSessionsOutputSchema = v.object({
  sessions: v.array(ActiveSessionSchema),
});

export const RevokeSessionInputSchema = v.strictObject({
  /** The session row's digest, as listed by `session.listSessions`. */
  sessionId: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/, "Identificador de sessão inválido.")),
});

export const RevokeSessionOutputSchema = v.object({
  revoked: v.number(),
});

/** An opaque, already-hashed session digest. Never a bearer token. */
export const SessionDigestSchema = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

/** A team member of the store, with the role the capability map reads. */
export const TeamMemberSchema = v.object({
  memberId: v.string(),
  name: v.nullable(v.string()),
  email: v.pipe(v.string(), v.email()),
  kind: MemberKindSchema,
  role: TenantRoleSchema,
  joinedAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const TeamMembersOutputSchema = v.object({
  members: v.array(TeamMemberSchema),
});

export const StoreDisplayNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(2, "Informe o nome da loja."),
  v.maxLength(120, "O nome deve ter no máximo 120 caracteres."),
);

export const CreateStoreInputSchema = v.strictObject({
  displayName: StoreDisplayNameSchema,
  slug: StoreSlugSchema,
});

export const sessionContract = oc.errors({
  ...sharedErrorCodes,
});

export const login = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/session/login",
      operationId: "loginTenantSession",
      summary: "Autentica um membro do painel e abre uma sessão de gestão.",
      tags: ["session"],
    }),
  )
  .input(LoginInputSchema)
  .output(LoginOutputSchema);

export const logout = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/session/logout",
      operationId: "logoutTenantSession",
      summary: "Revoga a sessão de gestão atual.",
      tags: ["session"],
    }),
  )
  .output(LogoutOutputSchema);

export const current = sessionContract
  .meta(
    openapi({
      method: "GET",
      path: "/session/current",
      operationId: "getTenantSession",
      summary: "Retorna o membro autenticado e as lojas às quais ele pertence.",
      tags: ["session"],
    }),
  )
  .output(CurrentOutputSchema);

export const register = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/session/register",
      operationId: "registerTenantAccount",
      summary: "Cria uma conta de gestão e abre uma sessão.",
      tags: ["session"],
    }),
  )
  .input(RegisterInputSchema)
  .output(RegisterOutputSchema);

export const getStore = sessionContract
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}",
      operationId: "getPanelStore",
      summary: "Resolve um slug de loja para o tenant e a membership do membro.",
      tags: ["panel"],
    }),
  )
  .input(GetStoreInputSchema)
  .output(GetStoreOutputSchema);

export const createStore = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores",
      operationId: "createPanelStore",
      summary: "Cria uma loja e vincula o membro autenticado como proprietário.",
      tags: ["panel"],
    }),
  )
  .input(CreateStoreInputSchema)
  .output(GetStoreOutputSchema);

/**
 * Every panel read shares the same guard: the server resolves `storeSlug` to a
 * tenant, verifies membership and opens the tenant scope, so a non-member gets
 * `NOT_FOUND` without learning whether the store exists (ADR-0005).
 */
const panelRead = oc.errors({ ...sharedErrorCodes });

/**
 * The account surface is member-level: no `storeSlug`, because a management
 * account spans stores. It is separate from the session router because it has
 * no `storeSlug` in its input and must never grow one.
 */
export const accountContract = oc.errors({ ...sharedErrorCodes });

export const listSessions = accountContract
  .meta(
    openapi({
      method: "GET",
      path: "/account/sessions",
      operationId: "listAccountSessions",
      summary: "Lista as sessões ativas da conta, da mais recente para a mais antiga.",
      tags: ["account"],
    }),
  )
  .output(ActiveSessionsOutputSchema);

export const changePassword = accountContract
  .meta(
    openapi({
      method: "PUT",
      path: "/account/password",
      operationId: "changeAccountPassword",
      summary: "Troca a senha da conta e revoga as demais sessões.",
      tags: ["account"],
    }),
  )
  .input(ChangePasswordInputSchema)
  .output(ChangePasswordOutputSchema);

export const revokeSession = accountContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/account/sessions/{sessionId}",
      operationId: "revokeAccountSession",
      summary: "Revoga uma sessão da conta pelo identificador.",
      tags: ["account"],
    }),
  )
  .input(RevokeSessionInputSchema)
  .output(RevokeSessionOutputSchema);

/**
 * Revoking every session but the caller's is the response to a suspected
 * compromise, so it is a single call rather than a loop the client has to
 * assemble (and could interrupt halfway).
 */
export const revokeOtherSessions = accountContract
  .meta(
    openapi({
      method: "POST",
      path: "/account/sessions/revoke-others",
      operationId: "revokeOtherAccountSessions",
      summary: "Revoga todas as sessões da conta exceto a atual.",
      tags: ["account"],
    }),
  )
  .output(RevokeSessionOutputSchema);

export const listOrders = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/orders",
      operationId: "listPanelOrders",
      summary: "Lista os pedidos da loja, do mais recente ao mais antigo.",
      tags: ["panel"],
    }),
  )
  .input(PanelOrdersInputSchema)
  .output(PanelOrdersOutputSchema);

export const getOrder = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/orders/{orderCode}",
      operationId: "getPanelOrder",
      summary: "Detalha um pedido da loja pelo seu código.",
      tags: ["panel"],
    }),
  )
  .input(PanelOrderIdInputSchema)
  .output(PanelOrderOutputSchema);

/**
 * Order operations reuse the shared codes plus the two the pure engine can
 * refuse with, so the dashboard can tell a stale button from a missing reason.
 */
const panelOrderContract = oc.errors({
  ...sharedErrorCodes,
  ORDER_TRANSITION_INVALID: {
    message: "Transição de pedido não permitida.",
    data: v.object({ reason: v.string() }),
  },
  REASON_REQUIRED: {
    message: "Esta transição exige um motivo.",
  },
});

export const getOrderTransitions = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/orders/{orderCode}/transitions",
      operationId: "getPanelOrderTransitions",
      summary: "Lista as transições de pedido permitidas ao chamador.",
      tags: ["panel"],
    }),
  )
  .input(PanelOrderIdInputSchema)
  .output(PanelOrderTransitionsOutputSchema);

export const transitionOrder = panelOrderContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/orders/{orderCode}/transition",
      operationId: "transitionPanelOrder",
      summary: "Move um dos dois eixos do pedido (financeiro ou de preparo).",
      tags: ["panel"],
    }),
  )
  .input(PanelOrderTransitionInputSchema)
  .output(PanelOrderStateOutputSchema);

export const recordOrderPayment = panelOrderContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/orders/{orderCode}/payment",
      operationId: "recordPanelOrderPayment",
      summary: "Registra o recebimento do pedido e credita o cashback uma única vez.",
      tags: ["panel"],
    }),
  )
  .input(PanelOrderIdInputSchema)
  .output(PanelOrderStateOutputSchema);

export const listCustomers = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/customers",
      operationId: "listPanelCustomers",
      summary: "Lista os clientes da loja com os totais derivados dos pedidos.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelCustomersOutputSchema);

export const getCustomer = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/customers/{customerId}",
      operationId: "getPanelCustomer",
      summary: "Detalha um cliente da loja e os pedidos dele.",
      tags: ["panel"],
    }),
  )
  .input(PanelCustomerIdInputSchema)
  .output(PanelCustomerOutputSchema);

export const listProducts = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/products",
      operationId: "listPanelProducts",
      summary: "Lista o catálogo da loja com o preço da variation padrão.",
      tags: ["panel"],
    }),
  )
  .input(ListProductsInputSchema)
  .output(PanelProductsOutputSchema);

export const getProduct = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/products/{productId}",
      operationId: "getPanelProduct",
      summary: "Detalha um produto com as variações e as tags.",
      tags: ["panel"],
    }),
  )
  .input(ProductIdInputSchema)
  .output(PanelProductOutputSchema);

export const createProduct = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/products",
      operationId: "createPanelProduct",
      summary: "Cria um produto com as variações e as tags informadas.",
      tags: ["panel"],
    }),
  )
  .input(CreateProductInputSchema)
  .output(PanelProductOutputSchema);

export const updateProduct = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/products/{productId}",
      operationId: "updatePanelProduct",
      summary: "Atualiza um produto, suas variações e suas tags.",
      tags: ["panel"],
    }),
  )
  .input(UpdateProductInputSchema)
  .output(PanelProductOutputSchema);

export const saveProductNutrition = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/products/{productId}/nutrition",
      operationId: "savePanelProductNutrition",
      summary: "Salva a tabela nutricional do produto e devolve o detalhe atualizado.",
      tags: ["panel"],
    }),
  )
  .input(SaveProductNutritionInputSchema)
  .output(PanelProductOutputSchema);

export const deleteProduct = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/products/{productId}",
      operationId: "deletePanelProduct",
      summary: "Exclui um produto do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(DeleteProductInputSchema)
  .output(PanelSuccessOutputSchema);

export const bulkUpdateProducts = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/products/bulk",
      operationId: "bulkUpdatePanelProducts",
      summary:
        "Atualiza disponibilidade, categoria, departamento ou adiciona tags em vários produtos.",
      tags: ["panel"],
    }),
  )
  .input(BulkUpdateProductsInputSchema)
  .output(BulkUpdateProductsOutputSchema);

export const bulkDeleteProducts = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/products/bulk-delete",
      operationId: "bulkDeletePanelProducts",
      summary: "Exclui vários produtos, pulando os que pertencem a pedidos ou kits.",
      tags: ["panel"],
    }),
  )
  .input(BulkDeleteProductsInputSchema)
  .output(BulkDeleteProductsOutputSchema);

export const listCategories = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/categories",
      operationId: "listPanelCategories",
      summary: "Lista as categorias do catálogo da loja com a contagem de itens.",
      tags: ["panel"],
    }),
  )
  .input(ListCategoriesInputSchema)
  .output(PanelCategoriesOutputSchema);

export const listDepartments = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/departments",
      operationId: "listPanelDepartments",
      tags: ["panel"],
    }),
  )
  .input(ListDepartmentsInputSchema)
  .output(PanelDepartmentsOutputSchema);

export const listTags = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/tags",
      operationId: "listPanelTags",
      tags: ["panel"],
    }),
  )
  .input(ListTagsInputSchema)
  .output(PanelTagsOutputSchema);

export const listBadges = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/badges",
      operationId: "listPanelBadges",
      summary: "Lista as etiquetas do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelBadgesOutputSchema);

export const createCategory = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/categories",
      operationId: "createPanelCategory",
      summary: "Cria uma categoria do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(CreateCategoryInputSchema)
  .output(PanelSuccessOutputSchema);

export const updateCategory = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/categories/{categoryId}",
      operationId: "updatePanelCategory",
      summary: "Renomeia uma categoria do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(UpdateCategoryInputSchema)
  .output(PanelSuccessOutputSchema);

export const deleteCategory = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/categories/{categoryId}",
      operationId: "deletePanelCategory",
      summary: "Exclui uma categoria sem produtos.",
      tags: ["panel"],
    }),
  )
  .input(DeleteCategoryInputSchema)
  .output(PanelSuccessOutputSchema);

export const listSubcategories = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/subcategories",
      operationId: "listPanelSubcategories",
      summary: "Lista as subcategorias da loja com a contagem de itens.",
      tags: ["panel"],
    }),
  )
  .input(ListSubcategoriesInputSchema)
  .output(PanelSubcategoriesOutputSchema);

export const createSubcategory = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/subcategories",
      operationId: "createPanelSubcategory",
      summary: "Cria uma subcategoria dentro de uma categoria.",
      tags: ["panel"],
    }),
  )
  .input(CreateSubcategoryInputSchema)
  .output(PanelSuccessOutputSchema);

export const updateSubcategory = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/subcategories/{subcategoryId}",
      operationId: "updatePanelSubcategory",
      summary: "Atualiza uma subcategoria.",
      tags: ["panel"],
    }),
  )
  .input(UpdateSubcategoryInputSchema)
  .output(PanelSuccessOutputSchema);

export const deleteSubcategory = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/subcategories/{subcategoryId}",
      operationId: "deletePanelSubcategory",
      summary: "Exclui uma subcategoria sem produtos.",
      tags: ["panel"],
    }),
  )
  .input(DeleteSubcategoryInputSchema)
  .output(PanelSuccessOutputSchema);

export const createDepartment = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/departments",
      operationId: "createPanelDepartment",
      summary: "Cria um departamento do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(CreateDepartmentInputSchema)
  .output(PanelSuccessOutputSchema);

export const updateDepartment = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/departments/{departmentId}",
      operationId: "updatePanelDepartment",
      summary: "Renomeia um departamento do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(UpdateDepartmentInputSchema)
  .output(PanelSuccessOutputSchema);

export const deleteDepartment = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/departments/{departmentId}",
      operationId: "deletePanelDepartment",
      summary: "Exclui um departamento sem produtos.",
      tags: ["panel"],
    }),
  )
  .input(DeleteDepartmentInputSchema)
  .output(PanelSuccessOutputSchema);

export const createTag = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/tags",
      operationId: "createPanelTag",
      summary: "Cria uma tag do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(CreateTagInputSchema)
  .output(PanelSuccessOutputSchema);

export const updateTag = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/tags/{tagId}",
      operationId: "updatePanelTag",
      summary: "Atualiza o nome e a visibilidade de uma tag.",
      tags: ["panel"],
    }),
  )
  .input(UpdateTagInputSchema)
  .output(PanelSuccessOutputSchema);

export const deleteTag = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/tags/{tagId}",
      operationId: "deletePanelTag",
      summary: "Exclui uma tag sem produtos.",
      tags: ["panel"],
    }),
  )
  .input(DeleteTagInputSchema)
  .output(PanelSuccessOutputSchema);

export const createBadge = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/badges",
      operationId: "createPanelBadge",
      summary: "Cria uma etiqueta do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(CreateBadgeInputSchema)
  .output(PanelSuccessOutputSchema);

export const updateBadge = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/badges/{badgeId}",
      operationId: "updatePanelBadge",
      summary: "Atualiza uma etiqueta do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(UpdateBadgeInputSchema)
  .output(PanelSuccessOutputSchema);

export const deleteBadge = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/badges/{badgeId}",
      operationId: "deletePanelBadge",
      summary: "Exclui uma etiqueta do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(DeleteBadgeInputSchema)
  .output(PanelSuccessOutputSchema);

export const listKits = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/kits",
      operationId: "listPanelKits",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelKitsOutputSchema);

export const listCoupons = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/coupons",
      operationId: "listPanelCoupons",
      summary: "Lista os cupons da loja.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelCouponsOutputSchema);

export const CreateCouponInputSchema = v.pipe(
  v.strictObject({
    storeSlug: v.pipe(
      v.string("Loja inválida."),
      v.nonEmpty("Loja inválida."),
      v.maxLength(120, "Loja inválida."),
    ),
    code: v.pipe(
      v.string("Informe o código do cupom."),
      v.nonEmpty("Informe o código do cupom."),
      v.maxLength(64, "Use no máximo 64 caracteres."),
    ),
    description: v.optional(
      v.pipe(v.string("Descrição inválida."), v.maxLength(280, "Use no máximo 280 caracteres.")),
    ),
    discountType: DiscountTypeSchema,
    discountValue: v.pipe(
      v.number("Informe um número válido."),
      v.integer("Use um número inteiro."),
      v.minValue(1, "O valor mínimo é 1."),
    ),
    usageLimit: v.optional(
      v.pipe(
        v.number("Informe um número válido."),
        v.integer("Use um número inteiro."),
        v.minValue(1, "O valor mínimo é 1."),
      ),
    ),
    perCustomerLimit: v.optional(
      v.pipe(
        v.number("Informe um número válido."),
        v.integer("Use um número inteiro."),
        v.minValue(1, "O valor mínimo é 1."),
      ),
    ),
    minimumOrderCents: v.optional(
      v.pipe(
        v.number("Informe um número válido."),
        v.integer("Use um número inteiro."),
        v.minValue(0, "O valor mínimo é 0."),
      ),
    ),
    maximumDiscountCents: v.optional(
      v.pipe(
        v.number("Informe um número válido."),
        v.integer("Use um número inteiro."),
        v.minValue(0, "O valor mínimo é 0."),
      ),
    ),
    shippingDiscountPercent: v.optional(
      v.pipe(
        v.number("Informe um número válido."),
        v.integer("Use um número inteiro."),
        v.minValue(0, "O valor mínimo é 0."),
        v.maxValue(100, "Use um valor de 0 a 100."),
      ),
    ),
    startsAt: v.optional(v.string()),
    endsAt: v.optional(v.string()),
    stackable: v.boolean(),
    firstPurchaseOnly: v.boolean(),
    status: CouponStatusSchema,
  }),
  v.check(
    (input) => input.discountType !== "percentage" || input.discountValue <= 100,
    "Para desconto percentual, use um valor de 1 a 100.",
  ),
);

export const UpdateCouponInputSchema = v.pipe(
  v.strictObject({
    storeSlug: v.pipe(
      v.string("Loja inválida."),
      v.nonEmpty("Loja inválida."),
      v.maxLength(120, "Loja inválida."),
    ),
    couponId: v.pipe(
      v.string("Cupom inválido."),
      v.nonEmpty("Cupom inválido."),
      v.maxLength(64, "Cupom inválido."),
    ),
    code: v.pipe(
      v.string("Informe o código do cupom."),
      v.nonEmpty("Informe o código do cupom."),
      v.maxLength(64, "Use no máximo 64 caracteres."),
    ),
    description: v.optional(
      v.nullable(
        v.pipe(v.string("Descrição inválida."), v.maxLength(280, "Use no máximo 280 caracteres.")),
      ),
    ),
    discountType: DiscountTypeSchema,
    discountValue: v.pipe(
      v.number("Informe um número válido."),
      v.integer("Use um número inteiro."),
      v.minValue(1, "O valor mínimo é 1."),
    ),
    usageLimit: v.optional(
      v.nullable(
        v.pipe(
          v.number("Informe um número válido."),
          v.integer("Use um número inteiro."),
          v.minValue(1, "O valor mínimo é 1."),
        ),
      ),
    ),
    perCustomerLimit: v.optional(
      v.nullable(
        v.pipe(
          v.number("Informe um número válido."),
          v.integer("Use um número inteiro."),
          v.minValue(1, "O valor mínimo é 1."),
        ),
      ),
    ),
    minimumOrderCents: v.optional(
      v.nullable(
        v.pipe(
          v.number("Informe um número válido."),
          v.integer("Use um número inteiro."),
          v.minValue(0, "O valor mínimo é 0."),
        ),
      ),
    ),
    maximumDiscountCents: v.optional(
      v.nullable(
        v.pipe(
          v.number("Informe um número válido."),
          v.integer("Use um número inteiro."),
          v.minValue(0, "O valor mínimo é 0."),
        ),
      ),
    ),
    shippingDiscountPercent: v.optional(
      v.nullable(
        v.pipe(
          v.number("Informe um número válido."),
          v.integer("Use um número inteiro."),
          v.minValue(0, "O valor mínimo é 0."),
          v.maxValue(100, "Use um valor de 0 a 100."),
        ),
      ),
    ),
    startsAt: v.optional(v.string()),
    endsAt: v.optional(v.string()),
    stackable: v.boolean(),
    firstPurchaseOnly: v.boolean(),
    status: CouponStatusSchema,
  }),
  v.check(
    (input) => input.discountType !== "percentage" || input.discountValue <= 100,
    "Para desconto percentual, use um valor de 1 a 100.",
  ),
);

export const DeleteCouponInputSchema = v.strictObject({
  storeSlug: v.pipe(v.string(), v.nonEmpty(), v.maxLength(120)),
  couponId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
});

const couponCreatedOutput = v.object({ coupon: PanelCouponSchema });

const couponDeletedOutput = v.object({ success: v.boolean() });

export const createCoupon = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/coupons",
      operationId: "createPanelCoupon",
      summary: "Cria um cupom promocional.",
      tags: ["panel"],
    }),
  )
  .input(CreateCouponInputSchema)
  .output(couponCreatedOutput);

export const updateCoupon = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/coupons/{couponId}",
      operationId: "updatePanelCoupon",
      summary: "Atualiza um cupom promocional.",
      tags: ["panel"],
    }),
  )
  .input(UpdateCouponInputSchema)
  .output(couponCreatedOutput);

export const deleteCoupon = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/coupons/{couponId}",
      operationId: "deletePanelCoupon",
      summary: "Exclui um cupom.",
      tags: ["panel"],
    }),
  )
  .input(DeleteCouponInputSchema)
  .output(couponDeletedOutput);

// --- SEO (MEN-233 / MEN-253) --------------------------------------------------
//
// Five editable fields per entity, all nullable: `null` (or an empty string) is
// "not set here", and the read side inherits the field from the store row, then
// the store templates, then a static default. `canonicalUrl` and `jsonLd` are
// entity-only — inheriting them would describe a different page.

/** Mirrors the contract's `seo_entity_type` enum. */
export const SeoEntityTypeSchema = v.picklist(
  ["store", "department", "category", "tag", "product", "kit", "coupon"],
  "Escolha um tipo de entidade.",
);

/** Which inheritance level won the field. `store` covers the settings template too. */
export const SeoSourceSchema = v.picklist(["entity", "store", "default"]);

/** Absolute http(s) URL, so a relative path cannot reach a `<link rel=canonical>`. */
function seoUrlSchema(message: string) {
  return v.pipe(
    v.string(message),
    v.check((value) => {
      try {
        const { protocol } = new URL(value);

        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, message),
  );
}

export const SeoFieldsSchema = v.object({
  title: v.nullable(
    v.pipe(v.string("Título inválido."), v.maxLength(70, "Use no máximo 70 caracteres.")),
  ),
  description: v.nullable(
    v.pipe(v.string("Descrição inválida."), v.maxLength(200, "Use no máximo 200 caracteres.")),
  ),
  canonicalUrl: v.nullable(
    seoUrlSchema("Informe uma URL completa, começando com http:// ou https://."),
  ),
  socialImageUrl: v.nullable(
    seoUrlSchema("Informe uma URL completa, começando com http:// ou https://."),
  ),
  jsonLd: v.nullable(
    v.pipe(v.string("JSON-LD inválido."), v.maxLength(4000, "Use no máximo 4000 caracteres.")),
  ),
});

/**
 * A partial save: an omitted field leaves the stored override untouched, while
 * `null` clears it so the field inherits again. The read side then falls through
 * to the store row, the templates and the static default.
 */
export const SaveSeoInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  entityType: SeoEntityTypeSchema,
  entityId: v.pipe(
    v.string("Entidade inválida."),
    v.nonEmpty("Entidade inválida."),
    v.maxLength(64, "Entidade inválida."),
  ),
  title: v.optional(SeoFieldsSchema.entries.title),
  description: v.optional(SeoFieldsSchema.entries.description),
  canonicalUrl: v.optional(SeoFieldsSchema.entries.canonicalUrl),
  socialImageUrl: v.optional(SeoFieldsSchema.entries.socialImageUrl),
  jsonLd: v.optional(SeoFieldsSchema.entries.jsonLd),
});

export const SaveStoreSeoSettingsInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  seoTitleTemplate: v.nullable(
    v.pipe(v.string("Modelo inválido."), v.maxLength(120, "Use no máximo 120 caracteres.")),
  ),
  seoDescriptionTemplate: v.nullable(
    v.pipe(v.string("Modelo inválido."), v.maxLength(200, "Use no máximo 200 caracteres.")),
  ),
  seoSocialImageUrl: v.nullable(
    seoUrlSchema("Informe uma URL completa, começando com http:// ou https://."),
  ),
});

export const StoreSeoSettingsSchema = v.object({
  seoTitleTemplate: v.nullable(v.string()),
  seoDescriptionTemplate: v.nullable(v.string()),
  seoSocialImageUrl: v.nullable(v.string()),
});

export const SeoResolvedSchema = v.object({
  title: v.string(),
  description: v.nullable(v.string()),
  canonicalUrl: v.nullable(v.string()),
  socialImageUrl: v.nullable(v.string()),
  jsonLd: v.nullable(v.string()),
  source: v.object({
    title: SeoSourceSchema,
    description: SeoSourceSchema,
    socialImageUrl: SeoSourceSchema,
  }),
});

export const PanelSeoEntitySchema = v.object({
  entityType: SeoEntityTypeSchema,
  entityId: v.string(),
  name: v.string(),
  hasOverride: v.boolean(),
});

export const PanelSeoEntitiesInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  entityType: v.optional(SeoEntityTypeSchema),
});

export const PanelSeoEntitiesOutputSchema = v.object({
  entities: v.array(PanelSeoEntitySchema),
});

export const PanelSeoInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  entityType: SeoEntityTypeSchema,
  entityId: v.pipe(v.string("Entidade inválida."), v.nonEmpty("Entidade inválida.")),
});

export const PanelSeoOutputSchema = v.object({
  saved: SeoFieldsSchema,
  resolved: SeoResolvedSchema,
});

export const PanelStoreSeoOutputSchema = v.object({
  settings: StoreSeoSettingsSchema,
  resolved: SeoResolvedSchema,
});

export const getStoreSeo = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/seo",
      operationId: "getPanelStoreSeo",
      summary: "Retorna os modelos de SEO da loja e os valores padrão resolvidos.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelStoreSeoOutputSchema);

export const saveStoreSeo = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/seo",
      operationId: "savePanelStoreSeo",
      summary: "Salva os modelos de SEO da loja.",
      tags: ["panel"],
    }),
  )
  .input(SaveStoreSeoSettingsInputSchema)
  .output(PanelStoreSeoOutputSchema);

export const listSeoEntities = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/seo/entities",
      operationId: "listPanelSeoEntities",
      summary: "Lista as entidades do tipo informado que aceitam override de SEO.",
      tags: ["panel"],
    }),
  )
  .input(PanelSeoEntitiesInputSchema)
  .output(PanelSeoEntitiesOutputSchema);

export const getSeo = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
      operationId: "getPanelSeo",
      summary: "Retorna o override salvo e os valores de SEO resolvidos da entidade.",
      tags: ["panel"],
    }),
  )
  .input(PanelSeoInputSchema)
  .output(PanelSeoOutputSchema);

export const saveSeo = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
      operationId: "savePanelSeo",
      summary: "Salva o override de SEO da entidade; campo vazio volta a herdar.",
      tags: ["panel"],
    }),
  )
  .input(SaveSeoInputSchema)
  .output(PanelSeoOutputSchema);

export const revertSeo = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
      operationId: "revertPanelSeo",
      summary: "Descarta o override de SEO da entidade e volta a herdar tudo.",
      tags: ["panel"],
    }),
  )
  .input(PanelSeoInputSchema)
  .output(PanelSeoOutputSchema);

// --- Payment gateways --------------------------------------------------------

/**
 * One gateway connection as the panel lists it. The provider secret is never
 * part of any shape here: `hasCredentials` only says whether one is stored.
 */
export const PanelPaymentIntegrationSchema = v.object({
  id: v.string(),
  provider: PaymentProviderSchema,
  label: v.string(),
  status: PaymentIntegrationStatusSchema,
  hasCredentials: v.boolean(),
  webhookPath: v.string(),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
});

/** Which integration handles one payment method for the store. */
export const PanelPaymentAssignmentSchema = v.object({
  method: PaymentMethodSchema,
  integrationId: v.string(),
  provider: PaymentProviderSchema,
  label: v.string(),
});

export const PanelPaymentSettingsOutputSchema = v.object({
  integrations: v.array(PanelPaymentIntegrationSchema),
  assignments: v.array(PanelPaymentAssignmentSchema),
});

export const SavePaymentIntegrationInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  /** Absent: create. Present: update that integration's label and/or secret. */
  integrationId: v.optional(v.pipe(v.string(), v.nonEmpty(), v.maxLength(64))),
  provider: PaymentProviderSchema,
  label: v.pipe(
    v.string("Informe um nome para a integração."),
    v.nonEmpty("Informe um nome para a integração."),
    v.maxLength(80, "Use no máximo 80 caracteres."),
  ),
  /**
   * The provider secret. Required to create an online integration; absent on
   * update keeps the stored one. It goes in and never comes back out.
   */
  secretKey: v.optional(
    v.pipe(
      v.string("Chave secreta inválida."),
      v.nonEmpty("Informe a chave secreta."),
      v.maxLength(200, "Chave secreta inválida."),
    ),
  ),
});

export const DeletePaymentIntegrationInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  integrationId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
});

export const SavePaymentMethodAssignmentInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  method: PaymentMethodSchema,
  /** `null` removes the assignment: the method is no longer offered. */
  integrationId: v.nullable(v.pipe(v.string(), v.nonEmpty(), v.maxLength(64))),
});

export const getPaymentSettings = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/payments",
      operationId: "getPanelPaymentSettings",
      summary: "Lista as integrações de pagamento da loja e o provedor de cada método.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelPaymentSettingsOutputSchema);

export const savePaymentIntegration = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/payments/integrations",
      operationId: "savePanelPaymentIntegration",
      summary: "Cria ou atualiza uma integração de pagamento; a chave secreta nunca é devolvida.",
      tags: ["panel"],
    }),
  )
  .input(SavePaymentIntegrationInputSchema)
  .output(v.object({ integration: PanelPaymentIntegrationSchema }));

export const deletePaymentIntegration = sessionContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/panel/stores/{storeSlug}/payments/integrations/{integrationId}",
      operationId: "deletePanelPaymentIntegration",
      summary: "Remove uma integração de pagamento que não esteja atendendo nenhum método.",
      tags: ["panel"],
    }),
  )
  .input(DeletePaymentIntegrationInputSchema)
  .output(v.object({ deleted: v.boolean() }));

export const savePaymentMethodAssignment = sessionContract
  .meta(
    openapi({
      method: "PUT",
      path: "/panel/stores/{storeSlug}/payments/methods/{method}",
      operationId: "savePanelPaymentMethodAssignment",
      summary: "Define qual integração atende um método de pagamento.",
      tags: ["panel"],
    }),
  )
  .input(SavePaymentMethodAssignmentInputSchema)
  .output(v.object({ assignments: v.array(PanelPaymentAssignmentSchema) }));

// --- Integrations (MEN-282) --------------------------------------------------
//
// The catalog is code (`./integrations.ts`); the API moves per-store state and
// the config blob. `config` crosses as an open record so a new integration can
// add a setting without a contract change — the integration module validates
// its own keys on read.

export const IntegrationConfigSchema = v.record(v.string(), v.union([v.string(), v.boolean()]));

export const PanelIntegrationSchema = v.object({
  integrationId: v.string(),
  status: IntegrationStatusSchema,
  config: IntegrationConfigSchema,
  enabledAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
  updatedAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
});

export const PanelIntegrationsOutputSchema = v.object({
  integrations: v.array(PanelIntegrationSchema),
});

export const SaveIntegrationInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  integrationId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
  /** `null` clears the integration; `error`/`paused` are set by its own checks. */
  status: v.optional(IntegrationStatusSchema),
  config: v.optional(IntegrationConfigSchema),
});

export const IntegrationIdInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  integrationId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
});

/** One connected MCP client. Never carries the token, only its identification. */
export const PanelMcpSessionSchema = v.object({
  id: v.string(),
  label: v.string(),
  clientName: v.string(),
  memberName: v.string(),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  lastUsedAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
});

export const PanelMcpSessionsOutputSchema = v.object({
  sessions: v.array(PanelMcpSessionSchema),
});

export const RevokeMcpSessionInputSchema = v.strictObject({
  ...PanelStoreInputSchema.entries,
  sessionId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
});

export const listIntegrations = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/integrations",
      operationId: "listPanelIntegrations",
      summary: "Estado por loja de cada integração do catálogo.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelIntegrationsOutputSchema);

export const saveIntegration = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/integrations/{integrationId}",
      operationId: "savePanelIntegration",
      summary: "Liga, desliga ou reconfigura uma integração da loja.",
      tags: ["panel"],
    }),
  )
  .input(SaveIntegrationInputSchema)
  .output(v.object({ integration: PanelIntegrationSchema }));

export const listMcpSessions = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/integrations/mcp-dashboard/sessions",
      operationId: "listPanelMcpSessions",
      summary: "Sessões MCP conectadas a esta loja.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelMcpSessionsOutputSchema);

export const revokeMcpSession = sessionContract
  .meta(
    openapi({
      method: "POST",
      path: "/panel/stores/{storeSlug}/integrations/mcp-dashboard/sessions/{sessionId}/revoke",
      operationId: "revokePanelMcpSession",
      summary: "Revoga a sessão MCP e o token que ela usa.",
      tags: ["panel"],
    }),
  )
  .input(RevokeMcpSessionInputSchema)
  .output(PanelSuccessOutputSchema);

export const listAuditLogs = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/audit-logs",
      operationId: "listPanelAuditLogs",
      summary: "Lista a trilha de auditoria da loja, do mais recente ao mais antigo.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(PanelAuditLogsOutputSchema);

/**
 * Read-only (MEN-225): the store's team, read from the seed. Inviting a member
 * needs email delivery, which is its own ticket.
 */
export const listTeamMembers = panelRead
  .meta(
    openapi({
      method: "GET",
      path: "/panel/stores/{storeSlug}/team",
      operationId: "listPanelTeamMembers",
      summary: "Lista os membros da equipe da loja com seus papéis.",
      tags: ["panel"],
    }),
  )
  .input(PanelStoreInputSchema)
  .output(TeamMembersOutputSchema);

export const profileContract = oc.errors({
  ...sharedErrorCodes,
});

export const saveOnboarding = profileContract
  .meta(
    openapi({
      method: "POST",
      path: "/profile/onboarding",
      operationId: "savePanelOnboarding",
      summary: "Registra (ou atualiza) as respostas de onboarding do membro autenticado.",
      tags: ["profile"],
    }),
  )
  .input(SaveOnboardingInputSchema)
  .output(OnboardingSchema);

export const sessionContractObject = {
  login,
  logout,
  current,
  register,
};

export const accountContractObject = {
  listSessions,
  changePassword,
  revokeSession,
  revokeOtherSessions,
};

export const panelContractObject = {
  getStore,
  createStore,
  listOrders,
  getOrder,
  getOrderTransitions,
  transitionOrder,
  recordOrderPayment,
  listCustomers,
  getCustomer,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  saveProductNutrition,
  deleteProduct,
  bulkUpdateProducts,
  bulkDeleteProducts,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listTags,
  createTag,
  updateTag,
  deleteTag,
  listBadges,
  createBadge,
  updateBadge,
  deleteBadge,
  listKits,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getStoreSeo,
  saveStoreSeo,
  listSeoEntities,
  getSeo,
  saveSeo,
  revertSeo,
  getPaymentSettings,
  savePaymentIntegration,
  deletePaymentIntegration,
  savePaymentMethodAssignment,
  listIntegrations,
  saveIntegration,
  listMcpSessions,
  revokeMcpSession,
  listAuditLogs,
  listTeamMembers,
};

export const profileContractObject = {
  saveOnboarding,
};

export type SessionMember = v.InferOutput<typeof SessionMemberSchema>;

export type SessionMembership = v.InferOutput<typeof SessionMembershipSchema>;

export type Onboarding = v.InferOutput<typeof OnboardingSchema>;

/** Panel read row shapes, derived from the contract outputs the pages render. */
export type PanelOrder = v.InferOutput<typeof PanelOrderSchema>;

export type PanelOrderDetail = v.InferOutput<typeof PanelOrderDetailSchema>;

export type PanelOrderItem = v.InferOutput<typeof PanelOrderItemSchema>;

export type PanelOrderEvent = v.InferOutput<typeof PanelOrderEventSchema>;

export type PanelOrderTransition = v.InferOutput<typeof PanelOrderTransitionSchema>;

export type PanelCustomer = v.InferOutput<typeof PanelCustomerSchema>;

export type PanelCustomerDetail = v.InferOutput<typeof PanelCustomerDetailSchema>;

export type PanelProduct = v.InferOutput<typeof PanelProductSchema>;

export type PanelProductList = v.InferOutput<typeof PanelProductListSchema>;

export type PanelProductVariation = v.InferOutput<typeof PanelProductVariationSchema>;

export type PanelProductDetail = v.InferOutput<typeof PanelProductDetailSchema>;

export type PanelProductNutrition = v.InferOutput<typeof PanelProductNutritionSchema>;

export type NutritionBasis = v.InferOutput<typeof NutritionBasisSchema>;

export type NutritionLabelFormat = v.InferOutput<typeof NutritionLabelFormatSchema>;

export type NutritionSource = v.InferOutput<typeof NutritionSourceSchema>;

/** The variation row the editor sends, after trimming and validation. */
export type ProductVariationInput = v.InferOutput<typeof ProductVariationInputSchema>;

export type PanelCategory = v.InferOutput<typeof PanelCategorySchema>;

export type PanelSubcategory = v.InferOutput<typeof PanelSubcategorySchema>;

export type PanelDepartment = v.InferOutput<typeof PanelDepartmentSchema>;

export type PanelCoupon = v.InferOutput<typeof PanelCouponSchema>;

export type PanelBadge = v.InferOutput<typeof PanelBadgeSchema>;

export type CreateBadgeInput = v.InferOutput<typeof CreateBadgeInputSchema>;

export type UpdateBadgeInput = v.InferOutput<typeof UpdateBadgeInputSchema>;

export type DeleteBadgeInput = v.InferOutput<typeof DeleteBadgeInputSchema>;

/** SEO row shapes: the saved override, the resolved values, and the list row. */
export type SeoEntityType = v.InferOutput<typeof SeoEntityTypeSchema>;

export type SeoFields = v.InferOutput<typeof SeoFieldsSchema>;

export type SeoResolved = v.InferOutput<typeof SeoResolvedSchema>;

export type SeoSource = v.InferOutput<typeof SeoSourceSchema>;

export type StoreSeoSettings = v.InferOutput<typeof StoreSeoSettingsSchema>;

export type PanelSeoEntity = v.InferOutput<typeof PanelSeoEntitySchema>;

export type PanelSeo = v.InferOutput<typeof PanelSeoOutputSchema>;

export type PanelStoreSeo = v.InferOutput<typeof PanelStoreSeoOutputSchema>;

export type PanelAuditLog = v.InferOutput<typeof PanelAuditLogSchema>;

/** Payment gateway row shapes, derived from the contract outputs. */
export type PanelPaymentIntegration = v.InferOutput<typeof PanelPaymentIntegrationSchema>;

export type PanelPaymentAssignment = v.InferOutput<typeof PanelPaymentAssignmentSchema>;

export type PaymentProvider = v.InferOutput<typeof PaymentProviderSchema>;

export type PaymentIntegrationStatus = v.InferOutput<typeof PaymentIntegrationStatusSchema>;

/** Account rows, derived from the contract outputs the settings page renders. */
export type ActiveSession = v.InferOutput<typeof ActiveSessionSchema>;

export type TeamMember = v.InferOutput<typeof TeamMemberSchema>;

/** Enum unions, mirroring the contract's lowercase ASCII stored values. */
export type FinancialStatus = v.InferOutput<typeof FinancialStatusSchema>;

export type FulfilmentStatus = v.InferOutput<typeof FulfilmentStatusSchema>;

export type PaymentMethod = v.InferOutput<typeof PaymentMethodSchema>;

export type StockMode = v.InferOutput<typeof StockModeSchema>;

export type DiscountType = v.InferOutput<typeof DiscountTypeSchema>;

export type CouponStatus = v.InferOutput<typeof CouponStatusSchema>;

export type TenantRole = v.InferOutput<typeof TenantRoleSchema>;

export type MemberKind = v.InferOutput<typeof MemberKindSchema>;

export type SessionRouterContract = typeof sessionContractObject;

export type PanelIntegration = v.InferOutput<typeof PanelIntegrationSchema>;

export type PanelMcpSession = v.InferOutput<typeof PanelMcpSessionSchema>;

export type IntegrationConfig = v.InferOutput<typeof IntegrationConfigSchema>;

export type AccountRouterContract = typeof accountContractObject;

export type PanelRouterContract = typeof panelContractObject;

export type ProfileRouterContract = typeof profileContractObject;
