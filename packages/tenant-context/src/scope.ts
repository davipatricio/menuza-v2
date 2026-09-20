import { AsyncLocalStorage } from "node:async_hooks";

type ScopeStore =
  | { readonly type: "tenant"; readonly tenantId: string }
  | { readonly type: "unscoped" };

const tenantScopeStorage = new AsyncLocalStorage<ScopeStore>();

/** Runs an asynchronous operation within an active tenant scope. */
export async function withTenant<T>(
  tenantId: string,
  fn: () => T | Promise<T>,
): Promise<Awaited<T>> {
  return await tenantScopeStorage.run({ type: "tenant", tenantId }, fn);
}

/** Explicit escape hatch for global operations (e.g. proxy domain-by-host lookup). */
export async function unscoped<T>(fn: () => T | Promise<T>): Promise<Awaited<T>> {
  return await tenantScopeStorage.run({ type: "unscoped" }, fn);
}

/** Returns the active tenantId, if any. Returns undefined if unscoped or outside any scope. */
export function getActiveTenantId(): string | undefined {
  const store = tenantScopeStorage.getStore();

  return store?.type === "tenant" ? store.tenantId : undefined;
}

/** Checks if the current execution is marked as intentionally unscoped. */
export function isUnscoped(): boolean {
  return tenantScopeStorage.getStore()?.type === "unscoped";
}
