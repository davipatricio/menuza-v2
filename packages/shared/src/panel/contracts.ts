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

export const sessionContractObject = {
  login,
  logout,
  current,
};

export const panelContractObject = {
  getStore,
};

export type SessionMember = v.InferOutput<typeof SessionMemberSchema>;

export type SessionMembership = v.InferOutput<typeof SessionMembershipSchema>;

export type SessionRouterContract = typeof sessionContractObject;

export type PanelRouterContract = typeof panelContractObject;
