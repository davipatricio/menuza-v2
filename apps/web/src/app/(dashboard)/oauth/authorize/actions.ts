"use server";

import { cookies } from "next/headers";

export interface AuthorizeInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  state?: string;
  tenantIds: string[];
  scopes?: string[];
}

export interface AuthorizeResult {
  ok: boolean;
  redirectUrl?: string;
  error?: string;
}

export async function authorizeOAuth(input: AuthorizeInput): Promise<AuthorizeResult> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("menuza_tenant_sid")?.value;

  if (!sessionId) {
    return { ok: false, error: "Sessão não encontrada. Faça login novamente." };
  }

  const tenantInternal = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

  try {
    const res = await fetch(`${tenantInternal}/oauth/authorize`, {
      method: "POST",
      headers: {
        cookie: `menuza_tenant_sid=${sessionId}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: input.codeChallengeMethod ?? "S256",
        tenantIds: input.tenantIds,
        scopes: input.scopes ?? ["admin"],
      }),
    });

    if (!res.ok) {
      // SAFETY: error response format from oauth endpoint
      const errData = (await res.json().catch(() => ({}))) as {
        error_description?: string;
        error?: string;
      };

      return {
        ok: false,
        error: errData.error_description ?? errData.error ?? "Erro ao autorizar aplicativo.",
      };
    }

    // SAFETY: success response format from oauth endpoint
    const data = (await res.json()) as { code: string; redirectUri: string };

    const redirectUrl = new URL(data.redirectUri);
    redirectUrl.searchParams.set("code", data.code);

    if (input.state) {
      redirectUrl.searchParams.set("state", input.state);
    }

    return { ok: true, redirectUrl: redirectUrl.toString() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro interno ao autorizar.",
    };
  }
}
