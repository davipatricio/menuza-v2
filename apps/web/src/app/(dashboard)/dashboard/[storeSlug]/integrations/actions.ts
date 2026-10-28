"use server";

import { revalidatePath } from "next/cache";
import { panelClient } from "@/lib/server-tenant.ts";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Turns one integration on or off from its card switch. */
export async function setIntegrationEnabled(input: {
  storeSlug: string;
  integrationId: string;
  enabled: boolean;
}): Promise<ActionResult> {
  const client = await panelClient();

  if (!client) return { ok: false, error: "Sessão expirada. Entre novamente." };

  try {
    await client.panel.saveIntegration({
      storeSlug: input.storeSlug,
      integrationId: input.integrationId,
      status: input.enabled ? "enabled" : "disabled",
    });

    revalidatePath(`/dashboard/${input.storeSlug}/integrations`);
    revalidatePath(`/dashboard/${input.storeSlug}/integrations/${input.integrationId}`);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível alterar a integração.",
    };
  }
}

/** Saves the detail page's settings for one integration. */
export async function saveIntegrationConfig(input: {
  storeSlug: string;
  integrationId: string;
  config: Record<string, string | boolean>;
}): Promise<ActionResult> {
  const client = await panelClient();

  if (!client) return { ok: false, error: "Sessão expirada. Entre novamente." };

  try {
    await client.panel.saveIntegration({
      storeSlug: input.storeSlug,
      integrationId: input.integrationId,
      config: input.config,
    });

    revalidatePath(`/dashboard/${input.storeSlug}/integrations`);
    revalidatePath(`/dashboard/${input.storeSlug}/integrations/${input.integrationId}`);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível salvar as configurações.",
    };
  }
}

/** Revokes one connected MCP session and the token behind it. */
export async function revokeMcpSession(input: {
  storeSlug: string;
  sessionId: string;
}): Promise<ActionResult> {
  const client = await panelClient();

  if (!client) return { ok: false, error: "Sessão expirada. Entre novamente." };

  try {
    await client.panel.revokeMcpSession({
      storeSlug: input.storeSlug,
      sessionId: input.sessionId,
    });

    revalidatePath(`/dashboard/${input.storeSlug}/integrations/mcp-dashboard`);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível revogar a sessão.",
    };
  }
}
