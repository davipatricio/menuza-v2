/**
 * Dashboard (management) contract: staff sessions and store resolution.
 *
 * Browser-safe: types and Valibot schemas only. These procedures are the real
 * auth surface for the dashboard (`menuza_tenant_sid` namespace). Login/logout
 * are mutations; `current` and `getStore` are reads.
 *
 * The dashboard does not send a tenant header: `panel.getStore` receives the
 * `storeSlug` from the URL and the server resolves `storeSlug -> tenant`,
 * checks the caller's membership and opens the tenant scope (MEN-225).
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
};

export const profileContractObject = {
  saveOnboarding,
};

export type SessionMember = v.InferOutput<typeof SessionMemberSchema>;

export type SessionMembership = v.InferOutput<typeof SessionMembershipSchema>;

export type Onboarding = v.InferOutput<typeof OnboardingSchema>;

export type SessionRouterContract = typeof sessionContractObject;

export type PanelRouterContract = typeof panelContractObject;

export type ProfileRouterContract = typeof profileContractObject;
