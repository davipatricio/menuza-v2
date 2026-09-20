export type AuthNamespace = "commerce" | "tenant";

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
