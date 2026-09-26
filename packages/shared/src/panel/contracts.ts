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

/** Mirrors the contract's `order_status` enum; the UI owns the pt-BR labels. */
export const OrderStatusSchema = v.picklist([
  "pending",
  "confirmed",
  "ready",
  "delivered",
  "canceled",
  "awaiting_payment",
  "paid",
  "ready_for_pickup",
  "completed",
  "refunded",
  "expired",
]);

/** Mirrors the contract's `stock_mode` enum (MEN-81). */
export const StockModeSchema = v.picklist(["controlled", "unlimited"]);

/** Mirrors the contract's `discount_type` enum (MEN-97). */
export const DiscountTypeSchema = v.picklist(["percentage", "fixed"]);

/** Mirrors the contract's `coupon_status` enum. */
export const CouponStatusSchema = v.picklist(["active", "expired", "disabled"]);

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

/** One order row as the panel's tables render it. `totalCents` is Int cents. */
export const PanelOrderSchema = v.object({
  id: v.string(),
  code: v.string(),
  customerId: v.string(),
  customerName: v.string(),
  totalCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  status: OrderStatusSchema,
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const PanelOrderDetailSchema = PanelOrderSchema;

export const PanelOrdersOutputSchema = v.object({
  orders: v.array(PanelOrderSchema),
});

export const PanelOrderOutputSchema = v.object({
  order: PanelOrderDetailSchema,
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
export const PanelProductSchema = v.object({
  id: v.string(),
  name: v.string(),
  categoryId: v.nullable(v.string()),
  categoryName: v.nullable(v.string()),
  priceCents: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  available: v.boolean(),
});

export const PanelProductsOutputSchema = v.object({
  products: v.array(PanelProductSchema),
});

export const PanelCategorySchema = v.object({
  id: v.string(),
  name: v.string(),
  itemsCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const PanelCategoriesOutputSchema = v.object({
  categories: v.array(PanelCategorySchema),
});

/** `valueCents` is set only for a fixed discount; percentages carry `valuePercent`. */
export const PanelCouponSchema = v.object({
  id: v.string(),
  code: v.string(),
  discountType: DiscountTypeSchema,
  valueCents: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  valuePercent: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
  usageCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
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
  .input(PanelStoreInputSchema)
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
  .input(PanelStoreInputSchema)
  .output(PanelProductsOutputSchema);

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
  .input(PanelStoreInputSchema)
  .output(PanelCategoriesOutputSchema);

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

export const panelContractObject = {
  getStore,
  createStore,
  listOrders,
  getOrder,
  listCustomers,
  getCustomer,
  listProducts,
  listCategories,
  listCoupons,
  listAuditLogs,
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

export type PanelCustomer = v.InferOutput<typeof PanelCustomerSchema>;

export type PanelCustomerDetail = v.InferOutput<typeof PanelCustomerDetailSchema>;

export type PanelProduct = v.InferOutput<typeof PanelProductSchema>;

export type PanelCategory = v.InferOutput<typeof PanelCategorySchema>;

export type PanelCoupon = v.InferOutput<typeof PanelCouponSchema>;

export type PanelAuditLog = v.InferOutput<typeof PanelAuditLogSchema>;

/** Enum unions, mirroring the contract's lowercase ASCII stored values. */
export type OrderStatus = v.InferOutput<typeof OrderStatusSchema>;

export type StockMode = v.InferOutput<typeof StockModeSchema>;

export type DiscountType = v.InferOutput<typeof DiscountTypeSchema>;

export type CouponStatus = v.InferOutput<typeof CouponStatusSchema>;

export type TenantRole = v.InferOutput<typeof TenantRoleSchema>;

export type SessionRouterContract = typeof sessionContractObject;

export type PanelRouterContract = typeof panelContractObject;

export type ProfileRouterContract = typeof profileContractObject;
