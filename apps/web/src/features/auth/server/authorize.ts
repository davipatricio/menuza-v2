import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import * as v from "valibot";

const SESSION_COOKIE = "menuza_tenant_sid";

const tenantInternal = (): string => process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

const checkRedirectSchema = v.object({
  clientId: v.string(),
  redirectUri: v.string(),
});

export const checkRedirectFn = createServerFn({ method: "GET" })
  .validator(checkRedirectSchema)
  .handler(async ({ data }): Promise<{ registered: boolean }> => {
    try {
      const url = new URL("/oauth/client-check", tenantInternal());
      url.searchParams.set("client_id", data.clientId);
      url.searchParams.set("redirect_uri", data.redirectUri);
      const response = await fetch(url, { cache: "no-store" });

      return { registered: response.ok };
    } catch {
      return { registered: false };
    }
  });

const authorizeSchema = v.object({
  clientId: v.string(),
  redirectUri: v.string(),
  codeChallenge: v.string(),
  codeChallengeMethod: v.optional(v.string()),
  tenantIds: v.array(v.string()),
  scopes: v.optional(v.array(v.string())),
  state: v.optional(v.string()),
});

const authorizeResponseSchema = v.object({
  code: v.string(),
  redirectUri: v.string(),
});

const errorResponseSchema = v.object({
  error: v.optional(v.string()),
  error_description: v.optional(v.string()),
});

type AuthorizeResult = { ok: true; redirectUrl: string } | { ok: false; error: string };

export const authorizeFn = createServerFn({ method: "POST" })
  .validator(authorizeSchema)
  .handler(async ({ data }): Promise<AuthorizeResult> => {
    const sid = getCookie(SESSION_COOKIE);

    if (!sid) return { ok: false, error: "Sessão não encontrada. Faça login novamente." };

    try {
      const response = await fetch(new URL("/oauth/authorize", tenantInternal()), {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${sid}`,
        },
        body: JSON.stringify({
          clientId: data.clientId,
          redirectUri: data.redirectUri,
          codeChallenge: data.codeChallenge,
          codeChallengeMethod: data.codeChallengeMethod ?? "S256",
          tenantIds: data.tenantIds,
          scopes: data.scopes ?? ["admin"],
        }),
      });

      if (!response.ok) {
        const payload = v.safeParse(errorResponseSchema, await response.json().catch(() => ({})));

        const message = payload.success
          ? (payload.output.error_description ?? payload.output.error)
          : undefined;

        return { ok: false, error: message ?? "Erro ao autorizar aplicativo." };
      }

      const payload = v.safeParse(authorizeResponseSchema, await response.json());

      if (!payload.success) return { ok: false, error: "Erro interno ao autorizar." };

      const url = new URL(payload.output.redirectUri);
      url.searchParams.set("code", payload.output.code);

      if (data.state) url.searchParams.set("state", data.state);

      return { ok: true, redirectUrl: url.toString() };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno ao autorizar.",
      };
    }
  });
