/**
 * Prisma 8 SQL middleware that records one span per query/execute.
 *
 * A span is only created when one is already active, so startup probes,
 * scripts, and migrations stay out of the traces. Queries correlate to their
 * `beforeQuery`/`beforeExecute` span through `ctx.planExecutionId`, the
 * runtime's own per-operation identity — not through async context, which is
 * not guaranteed across the row-consumption boundary.
 *
 * Statement text is truncated and bound parameters are never recorded. Treat
 * `db.statement` as potentially identifying: a literal-only query (raw SQL)
 * can carry values that parameterized plans keep out.
 */
import { SpanKind, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import type { SqlMiddleware } from "@prisma/orm-postgres/family-runtime";

/** Longest statement prefix kept as a span attribute. */
const MAX_STATEMENT = 512;

const DB_SYSTEM = "postgresql";

/** A span plus the abort wiring needed to detach it when the query ends. */
interface LiveSpan {
  readonly span: Span;
  readonly signal?: AbortSignal;
  readonly onAbort: () => void;
}

export function otelQueryMiddleware(tracer: Tracer = trace.getTracer("@menuza/db")): SqlMiddleware {
  /** Live spans keyed by `ctx.planExecutionId`. */
  const spans = new Map<string, LiveSpan>();

  const end = (id: string, apply?: (span: Span) => void): void => {
    const live = spans.get(id);

    if (!live) return;

    spans.delete(id);

    // Detach the abort listener so it does not accumulate on a long-lived
    // request signal across every query the request makes.
    if (live.signal) live.signal.removeEventListener("abort", live.onAbort);
    apply?.(live.span);
    live.span.end();
  };

  const start = (
    plan: { readonly sql: string },
    ctx: { readonly planExecutionId: string; readonly signal?: AbortSignal },
  ): void => {
    // No active span means no trace to extend.
    if (!trace.getActiveSpan()) return;

    const operation = operationOf(plan.sql);

    const span = tracer.startSpan(`db ${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system": DB_SYSTEM,
        "db.operation.name": operation,
        "db.statement": truncate(plan.sql),
      },
    });

    // The runtime may abort between the before and after hooks; end the span
    // here so an aborted operation cannot leak one.
    const onAbort = (): void => {
      end(ctx.planExecutionId, (aborted) => {
        aborted.setStatus({ code: SpanStatusCode.ERROR, message: "aborted" });
      });
    };

    spans.set(ctx.planExecutionId, { span, signal: ctx.signal, onAbort });

    ctx.signal?.addEventListener("abort", onAbort, { once: true });
  };

  return {
    name: "otel-query",
    familyId: "sql",
    beforeQuery: start,
    async afterQuery(_plan, result, ctx) {
      end(ctx.planExecutionId, (span) => {
        span.setAttribute("db.response.returned_rows", result.rowCount);
        span.setAttribute("db.query.source", result.source);

        if (!result.completed) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: "incomplete" });
        }
      });
    },
    beforeExecute: start,
    async afterExecute(_plan, result, ctx) {
      end(ctx.planExecutionId, (span) => {
        span.setAttribute("db.query.source", result.source);

        if (result.completed) {
          span.setAttribute("db.response.affected_rows", result.stats.affectedRows);
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR, message: "incomplete" });
        }
      });
    },
  };
}

/** Leading SQL keyword (`SELECT`, `INSERT`, ...) or `QUERY` when unavailable. */
function operationOf(sql: string): string {
  return /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "QUERY";
}

function truncate(sql: string): string {
  return sql.length > MAX_STATEMENT ? `${sql.slice(0, MAX_STATEMENT)}...` : sql;
}
