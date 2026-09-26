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
  listCustomers,
  getCustomer,
  listProducts,
  listCategories,
  listCoupons,
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

export type PanelCustomer = v.InferOutput<typeof PanelCustomerSchema>;

export type PanelCustomerDetail = v.InferOutput<typeof PanelCustomerDetailSchema>;

export type PanelProduct = v.InferOutput<typeof PanelProductSchema>;

export type PanelCategory = v.InferOutput<typeof PanelCategorySchema>;

export type PanelCoupon = v.InferOutput<typeof PanelCouponSchema>;

export type PanelAuditLog = v.InferOutput<typeof PanelAuditLogSchema>;

/** Account rows, derived from the contract outputs the settings page renders. */
export type ActiveSession = v.InferOutput<typeof ActiveSessionSchema>;

export type TeamMember = v.InferOutput<typeof TeamMemberSchema>;

/** Enum unions, mirroring the contract's lowercase ASCII stored values. */
export type OrderStatus = v.InferOutput<typeof OrderStatusSchema>;

export type StockMode = v.InferOutput<typeof StockModeSchema>;

export type DiscountType = v.InferOutput<typeof DiscountTypeSchema>;

export type CouponStatus = v.InferOutput<typeof CouponStatusSchema>;

export type TenantRole = v.InferOutput<typeof TenantRoleSchema>;

export type MemberKind = v.InferOutput<typeof MemberKindSchema>;

export type SessionRouterContract = typeof sessionContractObject;

export type AccountRouterContract = typeof accountContractObject;

export type PanelRouterContract = typeof panelContractObject;

export type ProfileRouterContract = typeof profileContractObject;
