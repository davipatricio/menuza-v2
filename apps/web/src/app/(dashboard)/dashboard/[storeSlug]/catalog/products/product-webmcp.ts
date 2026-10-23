"use client";

import { useEffect } from "react";
import * as v from "valibot";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type JsonSchema = { [key: string]: JsonValue };

/** JSON input shape the browser hands to a tool; parsed per tool before use. */
type ToolInput = {
  [key: string]: string | number | boolean | null | string[] | undefined;
};

type ToolResult = { ok: boolean; error?: string };

type Tool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute: (input: ToolInput) => ToolResult | Promise<ToolResult>;
};

type ModelContext = {
  registerTool: (tool: Tool) => void;
  unregisterTool?: (name: string) => void;
};

const FillInputSchema = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  categoryId: v.optional(v.nullable(v.string())),
  departmentId: v.optional(v.nullable(v.string())),
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
    categoryId: { type: ["string", "null"] },
    departmentId: { type: ["string", "null"] },
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
 * WebMCP is a draft browser API and not in lib.dom yet. Chrome exposes it on
 * `document.modelContext`; older builds used `navigator.modelContext`. Absent
 * in every other browser, where this whole module is a no-op.
 */
function readModelContext(): ModelContext | null {
  // SAFETY: WebMCP is a draft global not in lib.dom; the hook runs only in the
  // browser, so `document` and `navigator` exist and the property is optional.
  const doc = document as { modelContext?: ModelContext };
  // SAFETY: same draft global, older exposure point.
  const nav = navigator as { modelContext?: ModelContext };

  return doc.modelContext ?? nav.modelContext ?? null;
}

/**
 * Exposes the controlled form to an in-browser agent. The form stays the source
 * of truth: every tool calls the same TanStack setters the UI calls, so saving
 * goes through the existing validation and mutation path.
 */
export function useProductWebMcp(form: any) {
  useEffect(() => {
    const context = readModelContext();

    if (!context) return;

    const names = ["product.fill", "product.addVariation", "product.save"];

    context.registerTool({
      name: "product.fill",
      description:
        "Preenche campos do produto. Aceita name, description, categoryId, departmentId, tagIds, available e sortOrder.",
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

        if (values.categoryId !== undefined) {
          form.setFieldValue("categoryId", values.categoryId);
        }

        if (values.departmentId !== undefined) {
          form.setFieldValue("departmentId", values.departmentId);
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
    });

    context.registerTool({
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
    });

    context.registerTool({
      name: "product.save",
      description: "Valida e envia o formulário de produto.",
      inputSchema: EMPTY_INPUT,
      execute: async () => {
        await form.handleSubmit();

        return { ok: true };
      },
    });

    return () => {
      for (const name of names) context.unregisterTool?.(name);
    };
  }, [form]);
}
