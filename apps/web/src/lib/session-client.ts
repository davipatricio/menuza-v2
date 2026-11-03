/**
 * Browser-side staff session client.
 *
 * Same-origin REST calls to `/tenant/...` (proxied to the loopback tenant API by
 * the Vite dev server and the built app's server). `session.login` and
 * `session.register` respond with a `menuza_tenant_sid` `Set-Cookie`, which the
 * browser applies to this origin, so the dashboard's route loaders pick the
 * session up on the next request. Client only.
 */
import type { RouterContractClient } from "@orpc/contract";
import type { Onboarding, tenantContractObject } from "@menuza/shared/tenant";
import {
  getChangeAccountPasswordUrl,
  getCreatePanelStoreUrl,
  getLoginTenantSessionUrl,
  getLogoutTenantSessionUrl,
  getRegisterTenantAccountUrl,
  getRevokeAccountSessionUrl,
  getRevokeOtherAccountSessionsUrl,
  getSavePanelOnboardingUrl,
} from "@/lib/api/tenant.ts";
import { ApiError } from "@/lib/api-error";

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

/** Maps an API status to the code callers switch on; anything else is a failure. */
function statusError(status: number): Error {
  const message = `tenant ${status}`;

  switch (status) {
    case 400:
    case 422:
      return new ApiError("BAD_REQUEST", message);
    case 401:
      return new ApiError("UNAUTHORIZED", message);
    case 403:
      return new ApiError("FORBIDDEN", message);
    case 404:
      return new ApiError("NOT_FOUND", message);
    case 409:
      return new ApiError("CONFLICT", message);
    default:
      return new ApiError("INTERNAL_SERVER_ERROR", message);
  }
}

/**
 * One same-origin request, throwing on a non-2xx answer. `credentials` is the
 * default for a same-origin URL but stays explicit: `session.login` needs the
 * `Set-Cookie` to land, and nothing here reads or forwards the cookie.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });

  if (!res.ok) throw statusError(res.status);

  const body = [204, 205, 304].includes(res.status) ? null : await res.text();

  // SAFETY: the route and the contract procedure document the same Rust DTO;
  // utoipa widens enum-valued fields to `string`, so the cast restores the
  // contract's narrower unions.
  return (body ? JSON.parse(body) : null) as T;
}

/** A write: JSON when there is a body, the contract's verb either way. */
function send<T, Body>(path: string, method: "POST" | "PUT" | "DELETE", body?: Body): Promise<T> {
  if (body === undefined) return request<T>(path, { method });

  return request<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function loginSession(input: { email: string; password: string }): Promise<void> {
  await send(getLoginTenantSessionUrl(), "POST", input);
}

export async function registerAccount(input: {
  name: string;
  email: string;
  birthdate: string;
  password: string;
}): Promise<RegisterResult> {
  return await send<RegisterResult, typeof input>(getRegisterTenantAccountUrl(), "POST", input);
}

export async function createStore(input: {
  displayName: string;
  slug: string;
}): Promise<CreateStoreResult> {
  return await send<CreateStoreResult, typeof input>(getCreatePanelStoreUrl(), "POST", input);
}

export async function saveOnboarding(input: SaveOnboardingInput): Promise<Onboarding> {
  return await send<Onboarding, SaveOnboardingInput>(getSavePanelOnboardingUrl(), "POST", input);
}

export async function logoutSession(): Promise<void> {
  await send(getLogoutTenantSessionUrl(), "POST");
}

export async function changePassword(input: ChangePasswordInput): Promise<{ changed: boolean }> {
  return await send<{ changed: boolean }, ChangePasswordInput>(
    getChangeAccountPasswordUrl(),
    "PUT",
    input,
  );
}

export async function revokeSession(sessionId: string): Promise<number> {
  return (
    await send<{ revoked: number }, undefined>(getRevokeAccountSessionUrl(sessionId), "DELETE")
  ).revoked;
}

export async function revokeOtherSessions(): Promise<number> {
  return (await send<{ revoked: number }, undefined>(getRevokeOtherAccountSessionsUrl(), "POST"))
    .revoked;
}
