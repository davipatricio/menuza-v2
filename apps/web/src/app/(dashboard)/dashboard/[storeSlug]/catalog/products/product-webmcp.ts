"use client";

import { useMemo } from "react";
import * as v from "valibot";
import { useRegisterTools } from "@/hooks/use-tools.ts";
import type { JsonSchema, ToolDefinition } from "@/lib/tools/registry.ts";

const FillInputSchema = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  subcategoryId: v.optional(v.nullable(v.string())),
  tagIds: v.optional(v.array(v.string())),
  available: v.optional(v.boolean()),
  sortOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

const AddVariationInputSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  priceCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  stockMode: v.picklist(["controlled", "unlimited"]),
  stockQty: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
});

const EMPTY_INPUT = {
  type: "object",
  properties: {},
  additionalProperties: false,
} satisfies JsonSchema;

const FILL_INPUT = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    subcategoryId: { type: ["string", "null"] },
    tagIds: { type: "array", items: { type: "string" } },
    available: { type: "boolean" },
    sortOrder: { type: "integer", minimum: 0 },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const ADD_VARIATION_INPUT = {
  type: "object",
  properties: {
    name: { type: "string" },
    priceCents: { type: "integer", minimum: 0 },
    stockMode: { type: "string", enum: ["controlled", "unlimited"] },
    stockQty: { type: ["integer", "null"], minimum: 0 },
  },
  required: ["name", "priceCents", "stockMode"],
  additionalProperties: false,
} satisfies JsonSchema;

/**
 * Exposes the controlled form to WebMCP and in-app AI assistant.
 * The form stays the source of truth: every tool calls the same TanStack setters
 * the UI calls, so saving goes through the existing validation and mutation path.
 */
export function useProductWebMcp(form: any) {
  const tools = useMemo<ToolDefinition[]>(
    () => [
      {
        name: "product.fill",
        description:
          "Preenche campos do produto. Aceita name, description, subcategoryId, tagIds, available e sortOrder.",
        inputSchema: FILL_INPUT,
        execute: (input) => {
          const parsed = v.safeParse(FillInputSchema, input);

          if (!parsed.success) {
            return { ok: false, error: "Campos com tipos inválidos." };
          }

          const values = parsed.output;

          if (values.name !== undefined) form.setFieldValue("name", values.name);

          if (values.description !== undefined) {
            form.setFieldValue("description", values.description);
          }

          if (values.subcategoryId !== undefined) {
            form.setFieldValue("subcategoryId", values.subcategoryId);
          }

          if (values.tagIds !== undefined) {
            form.setFieldValue("tagIds", values.tagIds);
          }

          if (values.available !== undefined) {
            form.setFieldValue("available", values.available);
          }

          if (values.sortOrder !== undefined) {
            form.setFieldValue("sortOrder", values.sortOrder);
          }

          return { ok: true };
        },
      },
      {
        name: "product.addVariation",
        description:
          "Adiciona uma variação ao produto. controlled exige stockQty; unlimited usa stockQty null.",
        inputSchema: ADD_VARIATION_INPUT,
        execute: (input) => {
          const parsed = v.safeParse(AddVariationInputSchema, input);

          if (!parsed.success) {
            return { ok: false, error: "Variação com tipos inválidos." };
          }

          const variation = parsed.output;

          form.pushFieldValue("variations", {
            name: variation.name,
            priceCents: variation.priceCents,
            stockMode: variation.stockMode,
            stockQty: variation.stockMode === "unlimited" ? null : (variation.stockQty ?? 0),
          });

          return { ok: true };
        },
      },
      {
        name: "product.save",
        description: "Valida e envia o formulário de produto.",
        inputSchema: EMPTY_INPUT,
        execute: async () => {
          await form.handleSubmit();

          return { ok: true };
        },
      },
    ],
    [form],
  );

  useRegisterTools(tools);
}
