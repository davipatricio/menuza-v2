/**
 * Browser-side staff session client.
 *
 * Same-origin calls to `/tenant/rpc` (rewritten to the loopback tenant API by
 * `next.config.ts`). `session.login`/`session.register` respond with a
 * `menuza_tenant_sid` `Set-Cookie`, which the browser applies to this origin, so
 * the dashboard's server components pick the session up on the next request.
 * Client only.
 */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import type { Onboarding, tenantContractObject } from "@menuza/shared/tenant";

type TenantClient = RouterContractClient<typeof tenantContractObject>;

/** The dashboard session payload, derived from `session.current`'s contract output. */
export type PanelSession = Awaited<ReturnType<TenantClient["session"]["current"]>>;

/** Register payload, derived from `session.register`'s contract output. */
type RegisterResult = Awaited<ReturnType<TenantClient["session"]["register"]>>;

/** Create-store payload, derived from `panel.createStore`'s contract output. */
type CreateStoreResult = Awaited<ReturnType<TenantClient["panel"]["createStore"]>>;

/** Onboarding answers, derived from the `profile.saveOnboarding` contract input. */
type SaveOnboardingInput = Parameters<TenantClient["profile"]["saveOnboarding"]>[0];

/** Password-change payload, derived from `account.changePassword`'s input. */
type ChangePasswordInput = Parameters<TenantClient["account"]["changePassword"]>[0];

function client(): TenantClient {
  return createORPCClient<TenantClient>(new RPCLink({ url: "/tenant/rpc" }));
}

export async function loginSession(input: { email: string; password: string }): Promise<void> {
  await client().session.login(input);
}

export async function registerAccount(input: {
  name: string;
  email: string;
  birthdate: string;
  password: string;
}): Promise<RegisterResult> {
  return await client().session.register(input);
}

export async function createStore(input: {
  displayName: string;
  slug: string;
}): Promise<CreateStoreResult> {
  return await client().panel.createStore(input);
}

export async function saveOnboarding(input: SaveOnboardingInput): Promise<Onboarding> {
  return await client().profile.saveOnboarding(input);
}

export async function logoutSession(): Promise<void> {
  await client().session.logout();
}

export async function changePassword(input: ChangePasswordInput): Promise<{ changed: boolean }> {
  return await client().account.changePassword(input);
}

export async function revokeSession(sessionId: string): Promise<number> {
  return (await client().account.revokeSession({ sessionId })).revoked;
}

export async function revokeOtherSessions(): Promise<number> {
  return (await client().account.revokeOtherSessions()).revoked;
}
