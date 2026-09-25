export type AuthNamespace = "commerce" | "tenant";

// Identity vocabulary. `Member.kind` and `TenantMembership.role` are free-text
// `String` columns, so these guards are the boundary that narrows a stored
// string into a closed union. Nothing is enforced yet; MEN-229 builds
// per-store/per-account scopes on top of the capability names.
export type MemberKind = "human" | "bot";

export const MEMBER_KINDS = ["human", "bot"] as const;

const memberKindSet: ReadonlySet<string> = new Set<string>(MEMBER_KINDS);

export function isMemberKind(value: string): value is MemberKind {
  return memberKindSet.has(value);
}

export type TenantRole = "owner" | "admin" | "staff";

export const TENANT_ROLES = ["owner", "admin", "staff"] as const;

const tenantRoleSet: ReadonlySet<string> = new Set<string>(TENANT_ROLES);

export function isTenantRole(value: string): value is TenantRole {
  return tenantRoleSet.has(value);
}

// Capabilities are named `resource:action` on purpose: the same strings are
// meant to become scoped grants for third-party platform apps later. Keep the
// set minimal — only what a store dashboard actually gates today.
export const TENANT_CAPABILITIES = [
  "dashboard:read",
  "orders:read",
  "orders:write",
  "team:read",
  "team:write",
] as const;

export type TenantCapability = (typeof TENANT_CAPABILITIES)[number];

// Single source of truth for grants. owner/admin are expressed as the full set
// minus an explicit exclusion so a new capability cannot silently land in no
// role (or, worse, in every role but owner).
const ROLE_CAPABILITIES: Readonly<Record<TenantRole, ReadonlySet<TenantCapability>>> = {
  owner: new Set<TenantCapability>(TENANT_CAPABILITIES),
  admin: new Set<TenantCapability>(
    TENANT_CAPABILITIES.filter((capability) => capability !== "team:write"),
  ),
  staff: new Set<TenantCapability>(["dashboard:read", "orders:read", "orders:write"]),
};

export function can(role: TenantRole, capability: TenantCapability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export interface CommerceSessionContext {
  readonly sessionId: string;
  readonly memberId: string;
}

export interface TenantSessionContext {
  readonly sessionId: string;
  readonly memberId: string;
  readonly tenantId: string;
  readonly role: string;
}

export type AuthSessionContext<TNamespace extends AuthNamespace> = TNamespace extends "tenant"
  ? TenantSessionContext
  : CommerceSessionContext;

export interface AuthContext<TNamespace extends AuthNamespace> {
  readonly session: AuthSessionContext<TNamespace>;
}
