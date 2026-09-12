/**
 * Client-side bridge between TanStack Query mutations and the background sync queue.
 *
 * Subscribes to the QueryClient's `MutationCache`. When a mutation transitions
 * to status `error` while `navigator.onLine === false`, the request is captured
 * and enqueued for replay on reconnect. Successful and intentionally-thrown
 * errors (validation, 4xx) are NOT captured.
 *
 * The capture layer is opt-in: callers register a `mutationKey` and a
 * `path(input) => string` that resolves the relative URL. We do NOT
 * second-guess the mutationFn's serialization.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Mutation, MutationCacheNotifyEvent } from "@tanstack/react-query";
import { enqueueMutation, emitEnqueued } from "./sync-queue.ts";

export interface CaptureRule {
  /**
   * TanStack mutation key. Only mutations whose `mutationKey` matches
   * (deep equality on the first element) are captured.
   */
  mutationKey: string;
  /**
   * Resolve a the relative URL path for the captured request, e.g.
   * `(vars) => `/orders/${vars.id}``.
   */
  path: (input: unknown) => string;
  /**
   * Resolve the HTTP method. Defaults to POST. We do not rewrite this; the
   * caller's `mutationFn` determines the actual transport.
   */
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
}

export interface CaptureOptions {
  origin: string;
  rules: CaptureRule[];
}

interface MutationLike {
  state: { status: string; error: unknown };
  options: {
    mutationKey?: readonly unknown[];
    mutationFn?: (...args: unknown[]) => Promise<unknown>;
  };
  variables: unknown;
}

function ruleMatches(rule: CaptureRule, key: readonly unknown[] | undefined): boolean {
  if (!key || key.length === 0) return false;

  return key[0] === rule.mutationKey;
}

export function captureOfflineMutations(client: QueryClient, opts: CaptureOptions): () => void {
  const cache = client.getMutationCache();
  const seenErrorIds = new WeakSet<object>();

  const handler = (event: MutationCacheNotifyEvent) => {
    if (event.type !== "updated") return;

    const mutation = event.mutation as Mutation<
      unknown,
      unknown,
      unknown
    > as unknown as MutationLike;

    if (mutation.state.status !== "error") return;

    // Avoid re-enqueueing the same mutation object more than once.
    if (seenErrorIds.has(mutation as unknown as object)) return;

    if (typeof navigator !== "undefined" && navigator.onLine) return;

    const matchedRule = opts.rules.find((r) => ruleMatches(r, mutation.options.mutationKey));

    if (!matchedRule) return;

    seenErrorIds.add(mutation as unknown as object);

    const vars = mutation.variables;
    enqueueMutation({
      url: `${opts.origin}${matchedRule.path(vars)}`,
      method: matchedRule.method ?? "POST",
      body: vars,
      ifMatch: (vars as { ifMatch?: string } | undefined)?.ifMatch,
    })
      .then(emitEnqueued)
      .catch(() => {});
  };

  const unsubscribe = cache.subscribe(handler);

  return unsubscribe;
}
