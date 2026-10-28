"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import * as v from "valibot";
import { useRegisterTools } from "@/hooks/use-tools.ts";
import type { ToolDefinition } from "@/lib/tools/registry.ts";

export interface DashboardToolsProps {
  storeSlug: string;
  storeName?: string;
  role?: string;
}

const GoToInputSchema = v.object({
  path: v.pipe(v.string(), v.minLength(1)),
});

const SwitchStoreInputSchema = v.object({
  slug: v.pipe(v.string(), v.minLength(1)),
});

const GO_TO_SCHEMA = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description:
        "Destino da navegação no painel (ex: 'orders', 'catalog', 'coupons', 'settings').",
    },
  },
  required: ["path"],
  additionalProperties: false,
};

const GET_INFO_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const SWITCH_SCHEMA = {
  type: "object",
  properties: {
    slug: {
      type: "string",
      description: "Slug da loja para a qual alternar.",
    },
  },
  required: ["slug"],
  additionalProperties: false,
};

export function DashboardTools({ storeSlug, storeName, role }: DashboardToolsProps) {
  const router = useRouter();

  const tools = useMemo<ToolDefinition[]>(
    () => [
      {
        name: "navigation.go_to",
        description:
          "Navega para uma seção do painel da loja (ex: orders, catalog, coupons, settings).",
        inputSchema: GO_TO_SCHEMA,
        execute: (input) => {
          const parsed = v.safeParse(GoToInputSchema, input);

          if (!parsed.success) {
            return { ok: false, error: "Caminho (path) é obrigatório." };
          }

          const raw = parsed.output.path.trim();

          const target = raw.startsWith("/dashboard/")
            ? raw
            : `/dashboard/${storeSlug}/${raw.replace(/^\//, "")}`;

          router.push(target);

          return { ok: true, data: { path: target } };
        },
      },
      {
        name: "store.get_info",
        description: "Retorna informações da loja atual: slug, nome e papel do usuário.",
        inputSchema: GET_INFO_SCHEMA,
        execute: () => ({
          ok: true,
          data: {
            slug: storeSlug,
            name: storeName ?? storeSlug,
            role: role ?? "member",
          },
        }),
      },
      {
        name: "store.switch",
        description: "Alterna para o painel de outra loja pelo slug.",
        inputSchema: SWITCH_SCHEMA,
        execute: (input) => {
          const parsed = v.safeParse(SwitchStoreInputSchema, input);

          if (!parsed.success) {
            return { ok: false, error: "Slug da loja é obrigatório." };
          }

          const targetSlug = parsed.output.slug.trim();
          router.push(`/dashboard/${targetSlug}`);

          return { ok: true, data: { slug: targetSlug } };
        },
      },
    ],
    [storeSlug, storeName, role, router],
  );

  useRegisterTools(tools);

  return null;
}
