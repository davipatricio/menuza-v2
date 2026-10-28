"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useToolRegistry } from "@/lib/tools/registry.ts";
import type { ToolDefinition, ToolInput, ToolResult } from "@/lib/tools/registry.ts";

/**
 * Registers tools on mount and cleans up on unmount.
 */
export function useRegisterTools(tools: ToolDefinition[]) {
  const registry = useToolRegistry();

  useEffect(() => {
    registry.registerTools(tools);

    return () => {
      registry.unregisterTools(tools.map((t) => t.name));
    };
  }, [tools, registry]);
}

export interface AvailableTools {
  tools: ToolDefinition[];
  executeTool: (name: string, input?: ToolInput) => Promise<ToolResult>;
}

const EMPTY_TOOLS: ToolDefinition[] = [];

/**
 * Lists available active tools and exposes direct execution for in-app AI.
 */
export function useAvailableTools(): AvailableTools {
  const registry = useToolRegistry();
  const tools = useSyncExternalStore(registry.subscribe, registry.getSnapshot, () => EMPTY_TOOLS);

  const executeTool = useCallback(
    (name: string, input?: ToolInput) => registry.executeTool(name, input),
    [registry],
  );

  return useMemo(() => ({ tools, executeTool }), [tools, executeTool]);
}
