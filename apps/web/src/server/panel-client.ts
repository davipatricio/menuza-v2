/**
 * Server-side tenant client for the dashboard.
 *
 * Runs in Start server functions and loaders and forwards the incoming
 * `menuza_tenant_sid` cookie to the loopback tenant API (`TENANT_INTERNAL_URL`),
 * which is the only place tenancy is resolved. No shared client state across
 * requests.
 */
import { getRequest } from "@tanstack/react-start/server";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import type { tenantContractObject } from "@menuza/shared/tenant";
import * as v from "valibot";

const TENANT_SESSION_COOKIE = "menuza_tenant_sid";

export type TenantClient = RouterContractClient<typeof tenantContractObject>;

/** The dashboard session payload, derived from `session.current`'s contract output. */
export type PanelSession = Awaited<ReturnType<TenantClient["session"]["current"]>>;

/** Reads one cookie out of the raw `cookie` header; no cookie library needed here. */
function readSessionCookie(header: string | null): string {
  if (!header) return "";

  const prefix = `${TENANT_SESSION_COOKIE}=`;

  for (const pair of header.split(";")) {
    const entry = pair.trim();

    if (entry.startsWith(prefix)) return entry.slice(prefix.length).trim();
  }

  return "";
}

/**
 * A panel client bound to the current request's session cookie, or `null` when
 * there is no `menuza_tenant_sid`. Server functions call it instead of
 * assembling a client per route; the API still revalidates the session, so
 * forwarding the cookie is a transport detail and not the authorization.
 */
export async function panelClient(): Promise<TenantClient | null> {
  const sessionId = readSessionCookie(getRequest().headers.get("cookie"));

  if (!sessionId) return null;

  const origin = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

  return createORPCClient<TenantClient>(
    new RPCLink({
      origin,
      url: "/rpc",
      headers: { cookie: `${TENANT_SESSION_COOKIE}=${sessionId}` },
    }),
  );
}

/**
 * What the frontend may conclude from a session read.
 *
 * `unavailable` is deliberately not `unauthenticated`: a restarting or
 * unreachable tenant API must not sign the user out, so callers redirect only
 * on a definitive `unauthenticated` answer.
 */
export type PanelSessionState =
  | { status: "ok"; session: PanelSession }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

/** The only HTTP statuses that prove the session itself was refused. */
const DeniedStatusSchema = v.object({ status: v.picklist([401, 403]) });

/** A rejected call that proves the session is gone (and not that the API is down). */
function isUnauthenticated(error: Error): boolean {
  if (error instanceof ORPCError) {
    return error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN";
  }

  return v.is(DeniedStatusSchema, error);
}

/**
 * Reads the session for the current request and says which of the three states
 * it is in: signed in, signed out, or the API could not be asked.
 */
export async function readPanelSession(): Promise<PanelSessionState> {
  const client = await panelClient();

  if (!client) return { status: "unauthenticated" };

  try {
    return { status: "ok", session: await client.session.current() };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("Falha ao ler a sessão.");

    return isUnauthenticated(error) ? { status: "unauthenticated" } : { status: "unavailable" };
  }
}

/**
 * Returns the authenticated panel session for the current request, or `null`
 * when there is no usable `menuza_tenant_sid` cookie.
 */
export async function getPanelSession(): Promise<PanelSession | null> {
  const state = await readPanelSession();

  return state.status === "ok" ? state.session : null;
}
