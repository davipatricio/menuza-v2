import { AsyncLocalStorage } from "node:async_hooks";

type ScopeStore =
  | { readonly type: "tenant"; readonly tenantId: string }
  | { readonly type: "unscoped" };

const tenantScopeStorage = new AsyncLocalStorage<ScopeStore>();

/**
 * Runs an asynchronous operation within an active tenant scope.
 *
 * The callback's result is awaited *inside* the ALS run: a synchronous callback
 * that returns a thenable (e.g. Prisma's `AsyncIterableResult`) must have that
 * thenable consumed while the scope is still active. `run(store, fn)` only
 * applies the store to `fn`'s synchronous frame, so awaiting its return value
 * from the outer frame would attach the consumer outside the scope and the
 * tenant-isolation middleware would see no active tenant.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: () => T | Promise<T>,
): Promise<Awaited<T>> {
  return await tenantScopeStorage.run({ type: "tenant", tenantId }, async () => await fn());
}

/** Explicit escape hatch for global operations (e.g. proxy domain-by-host lookup). */
export async function unscoped<T>(fn: () => T | Promise<T>): Promise<Awaited<T>> {
  return await tenantScopeStorage.run({ type: "unscoped" }, async () => await fn());
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
