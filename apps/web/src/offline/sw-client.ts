/* eslint-disable anti-slop/no-runtime-typeof */
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
import type { MutationCacheNotifyEvent, QueryClient } from "@tanstack/react-query";
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
  path: (input: MutationVariables) => string;
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
  state: { status: string; error: Error | null };
  options: {
    mutationKey?: readonly unknown[];
    mutationFn?: (variables: MutationVariables) => Promise<MutationResult>;
  };
  variables: MutationVariables;
}

/** Result of a captured mutation function. The bridge never inspects it. */
export type MutationResult = globalThis.Record<string, never> | null | undefined | void;

/** Variables carried by a captured mutation. */
export interface MutationVariables {
  readonly [key: string]: MutationVariableValue;
}

export type MutationLeaf = { readonly [key: string]: MutationLeafValue };

export type MutationVariableValue = string | number | boolean | null | MutationLeaf;

export type MutationLeafValue = string | number | boolean | null | MutationLeaf | undefined;

/** Read an optional `ifMatch` ETag from mutation variables. Only the string
 *  branch is consumed; every other value shape yields `undefined`. */
function readIfMatch(vars: MutationVariables): string | undefined {
  const raw = vars["ifMatch"];

  if (isEtagString(raw)) return raw;

  return undefined;
}

function isEtagString(raw: MutationVariableValue | undefined): raw is string {
  return typeof raw === "string";
}

function isNavigatorOnline(): boolean {
  return navigator.onLine === true;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || isNavigatorOnline();
}

function ruleMatches(rule: CaptureRule, key: readonly unknown[] | undefined): boolean {
  if (!key || key.length === 0) return false;

  return key[0] === rule.mutationKey;
}

/** Mutation event as carried on the TanStack cache-notify event. Optional
 *  fields mirror TanStack's untyped mutation event at the bridge; callers
 *  ignore events that lack them. */
export interface MutationCandidate {
  readonly state?: { readonly status?: string };
  readonly options?: { readonly mutationKey?: readonly unknown[] };
  readonly variables?: MutationVariables;
}

/** Bridge event narrowing without indexed `unknown` access. */
function readBridgeMutation(candidate: MutationCandidate | undefined): MutationLike | undefined {
  const status = candidate?.state?.status;

  if (status === undefined || status !== "error") return undefined;

  const variables = candidate?.variables;

  if (variables === undefined) return undefined;

  const mutationKey = candidate?.options?.mutationKey;

  if (mutationKey !== undefined && !Array.isArray(mutationKey)) return undefined;

  return {
    state: { status, error: null },
    options: { mutationKey },
    variables,
  };
}

export function captureOfflineMutations(client: QueryClient, opts: CaptureOptions): () => void {
  const cache = client.getMutationCache();
  const seenErrorIds = new WeakSet<object>();

  const handler = (event: MutationCacheNotifyEvent) => {
    if (event.type !== "updated") return;

    // SAFETY: TanStack types the event mutation generically; the declared
    // `MutationCandidate` interface mirrors exactly the fields read below, and
    // `readBridgeMutation` re-validates each one, returning `undefined` for
    // anything unexpected (in which case the event is ignored).
    const mutation = readBridgeMutation(event.mutation as MutationCandidate);

    if (!mutation) return;

    if (mutation.state.status !== "error") return;

    // Avoid re-enqueueing the same mutation object more than once.
    if (seenErrorIds.has(mutation)) return;

    if (!isOnline()) return;

    const matchedRule = opts.rules.find((r) => ruleMatches(r, mutation.options.mutationKey));

    if (!matchedRule) return;

    seenErrorIds.add(mutation);

    const vars = mutation.variables;

    void enqueueMutation({
      url: `${opts.origin}${matchedRule.path(vars)}`,
      method: matchedRule.method ?? "POST",
      body: vars,
      ifMatch: readIfMatch(vars),
    })
      .then(emitEnqueued)
      .catch(() => {});
  };

  const unsubscribe = cache.subscribe(handler);

  return unsubscribe;
}
