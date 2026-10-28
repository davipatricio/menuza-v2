"use client";

import { createContext, useContext, useState, createElement, type ReactNode } from "react";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonSchema = { [key: string]: JsonValue };

export type ToolInput = {
  [key: string]: string | number | boolean | null | string[] | undefined | JsonValue;
};

export type ToolResult = {
  ok: boolean;
  error?: string;
  data?: JsonValue;
};

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute: (input: ToolInput) => ToolResult | Promise<ToolResult>;
}

export interface ModelContext {
  registerTool: (tool: ToolDefinition) => void;
  unregisterTool?: (name: string) => void;
}

/**
 * WebMCP draft global exposure point. Returns null outside browser or if unsupported.
 */
export function readModelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;

  // SAFETY: WebMCP is a draft global not in lib.dom; document exists in browser.
  const doc = document as { modelContext?: ModelContext };

  // SAFETY: same draft global, older exposure point.
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as {
    modelContext?: ModelContext;
  };

  return doc.modelContext ?? nav.modelContext ?? null;
}

/**
 * Unified tool registry storing active tools with dual-binding to WebMCP and in-app AI.
 */
export class ToolRegistry {
  private toolsMap = new Map<string, ToolDefinition>();
  private toolsSnapshot: ToolDefinition[] = [];
  private listeners = new Set<() => void>();

  registerTools(tools: ToolDefinition[]): void {
    if (tools.length === 0) return;
    let changed = false;

    for (const tool of tools) {
      if (this.toolsMap.get(tool.name) !== tool) {
        this.toolsMap.set(tool.name, tool);
        changed = true;
      }
    }

    if (!changed) return;

    this.toolsSnapshot = Array.from(this.toolsMap.values());

    const context = readModelContext();

    if (context) {
      for (const tool of tools) {
        context.registerTool(tool);
      }
    }

    this.notify();
  }

  unregisterTools(names: string[]): void {
    if (names.length === 0) return;
    let changed = false;

    for (const name of names) {
      if (this.toolsMap.delete(name)) {
        changed = true;
      }
    }

    if (!changed) return;

    this.toolsSnapshot = Array.from(this.toolsMap.values());

    const context = readModelContext();

    if (context?.unregisterTool) {
      for (const name of names) {
        context.unregisterTool(name);
      }
    }

    this.notify();
  }

  getTools(): ToolDefinition[] {
    return this.toolsSnapshot;
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.toolsMap.get(name);
  }

  async executeTool(name: string, input?: ToolInput): Promise<ToolResult> {
    const tool = this.toolsMap.get(name);

    if (!tool) {
      return { ok: false, error: `Ferramenta "${name}" não encontrada.` };
    }

    try {
      return await tool.execute(input ?? {});
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Erro ao executar ferramenta.",
      };
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ToolDefinition[] => {
    return this.toolsSnapshot;
  };

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// ponytail: global default registry for components outside ToolRegistryProvider; override by providing ToolRegistryProvider
export const defaultRegistry = new ToolRegistry();

const ToolRegistryContext = createContext<ToolRegistry>(defaultRegistry);

export function ToolRegistryProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new ToolRegistry());

  return createElement(ToolRegistryContext.Provider, { value: registry }, children);
}

export function useToolRegistry(): ToolRegistry {
  return useContext(ToolRegistryContext);
}
