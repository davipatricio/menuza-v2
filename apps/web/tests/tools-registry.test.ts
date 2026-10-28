import { describe, expect, test } from "bun:test";
import { readModelContext, ToolRegistry } from "../src/lib/tools/registry.ts";
import type { ModelContext, ToolDefinition } from "../src/lib/tools/registry.ts";

describe("tool registry", () => {
  test("readModelContext returns null when modelContext is absent", () => {
    expect(readModelContext()).toBeNull();
  });

  test("readModelContext detects document.modelContext", () => {
    const mockContext: ModelContext = {
      registerTool: () => {},
      unregisterTool: () => {},
    };

    // SAFETY: injecting mock on global document for test
    (globalThis as any).document = { modelContext: mockContext };

    expect(readModelContext()).toBe(mockContext);

    // SAFETY: cleanup test mock
    delete (globalThis as any).document;
  });

  test("ToolRegistry registers, retrieves, and executes tools", async () => {
    const registry = new ToolRegistry();
    expect(registry.getTools()).toEqual([]);

    const dummyTool: ToolDefinition = {
      name: "calc.add",
      description: "Adds numbers",
      inputSchema: { type: "object" },
      execute: (input) => {
        const a = Number(input.a);
        const b = Number(input.b);

        return { ok: true, data: { sum: a + b } };
      },
    };

    registry.registerTools([dummyTool]);
    expect(registry.getTools()).toHaveLength(1);
    expect(registry.getTool("calc.add")).toBe(dummyTool);

    const result = await registry.executeTool("calc.add", { a: 2, b: 3 });
    expect(result).toEqual({ ok: true, data: { sum: 5 } });

    const notFound = await registry.executeTool("calc.sub", {});
    expect(notFound.ok).toBe(false);
    expect(notFound.error).toContain("calc.sub");

    registry.unregisterTools(["calc.add"]);
    expect(registry.getTools()).toHaveLength(0);
  });

  test("ToolRegistry dual-binds to document.modelContext when present", () => {
    const registered: string[] = [];
    const unregistered: string[] = [];

    const mockContext: ModelContext = {
      registerTool: (t) => registered.push(t.name),
      unregisterTool: (n) => unregistered.push(n),
    };

    // SAFETY: injecting mock on global document for test
    (globalThis as any).document = { modelContext: mockContext };

    const registry = new ToolRegistry();

    const tool: ToolDefinition = {
      name: "test.tool",
      description: "Test",
      inputSchema: { type: "object" },
      execute: () => ({ ok: true }),
    };

    registry.registerTools([tool]);
    expect(registered).toEqual(["test.tool"]);

    registry.unregisterTools(["test.tool"]);
    expect(unregistered).toEqual(["test.tool"]);

    // SAFETY: cleanup test mock
    delete (globalThis as any).document;
  });

  test("ToolRegistry notifies subscribers when tools change", () => {
    const registry = new ToolRegistry();
    let notificationCount = 0;

    const unsubscribe = registry.subscribe(() => {
      notificationCount++;
    });

    const tool: ToolDefinition = {
      name: "notif.tool",
      description: "Test notification",
      inputSchema: { type: "object" },
      execute: () => ({ ok: true }),
    };

    registry.registerTools([tool]);
    expect(notificationCount).toBe(1);

    // Registering the exact same tool reference doesn't trigger spurious notifications
    registry.registerTools([tool]);
    expect(notificationCount).toBe(1);

    registry.unregisterTools(["notif.tool"]);
    expect(notificationCount).toBe(2);

    unsubscribe();
    registry.registerTools([tool]);
    expect(notificationCount).toBe(2);
  });

  test("ToolRegistry catches execution errors gracefully", async () => {
    const registry = new ToolRegistry();

    const failingTool: ToolDefinition = {
      name: "failing.tool",
      description: "Throws error",
      inputSchema: { type: "object" },
      execute: () => {
        throw new Error("Explosion");
      },
    };

    registry.registerTools([failingTool]);
    const res = await registry.executeTool("failing.tool");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Explosion");
  });
});
