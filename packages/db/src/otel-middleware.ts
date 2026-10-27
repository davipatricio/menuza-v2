/**
 * Prisma 8 SQL middleware that records one span per query/execute.
 *
 * A span is only created when one is already active, so startup probes,
 * scripts, and migrations stay out of the traces. Queries correlate to their
 * span through the activity id — the runtime's own per-statement identity —
 * not through async context, which is not guaranteed across the
 * row-consumption boundary.
 *
 * Statement text is truncated and bound parameters are never recorded. Treat
 * `db.statement` as potentially identifying: a literal-only query (raw SQL)
 * can carry values that parameterized plans keep out.
 */
import { SpanKind, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import type { SqlMiddleware, StatementActivity } from "@prisma/orm-postgres/family-runtime";

/** Longest statement prefix kept as a span attribute. */
const MAX_STATEMENT = 512;

const DB_SYSTEM = "postgresql";

/** A span plus the abort wiring needed to detach it when the query ends. */
interface LiveSpan {
  readonly span: Span;
  readonly signal?: AbortSignal;
  readonly onAbort: () => void;
}

/** A statement activity narrowed to the plan the SQL lane executes. */
type SqlStatementActivity = StatementActivity & {
  readonly plan: { readonly sql: string };
};

/** The statement text of a statement activity's plan. */
function statementOf(activity: StatementActivity): string {
  // SAFETY: a statement activity carries the `SqlExecutionPlan` the caller
  // sent; the activity union widens `plan` to `QueryPlan`, which has no
  // `sql` field, so the concrete plan is read back here.
  const statement = activity as SqlStatementActivity;

  return statement.plan.sql;
}

export function otelQueryMiddleware(tracer: Tracer = trace.getTracer("@menuza/db")): SqlMiddleware {
  /** Live spans keyed by the activity id. */
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

  const start = (activity: StatementActivity, ctx: { readonly signal?: AbortSignal }): void => {
    // No active span means no trace to extend.
    if (!trace.getActiveSpan()) return;

    const sql = statementOf(activity);
    const operation = operationOf(sql);

    const span = tracer.startSpan(`db ${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system": DB_SYSTEM,
        "db.operation.name": operation,
        "db.statement": truncate(sql),
      },
    });

    // The runtime may abort between the start and end hooks; end the span
    // here so an aborted operation cannot leak one.
    const onAbort = (): void => {
      end(activity.id, (aborted) => {
        aborted.setStatus({ code: SpanStatusCode.ERROR, message: "aborted" });
      });
    };

    spans.set(activity.id, { span, signal: ctx.signal, onAbort });

    ctx.signal?.addEventListener("abort", onAbort, { once: true });
  };

  return {
    name: "otel-query",
    familyId: "sql",
    async activityStarted(activity, ctx) {
      if (activity.kind !== "statement") return;

      start(activity, ctx);
    },
    async activityEnded(activity, result) {
      if (activity.kind !== "statement" || result.kind !== "statement") return;

      end(activity.id, (span) => {
        span.setAttribute("db.query.source", result.source);

        if (result.outcome !== "succeeded") {
          span.setStatus({ code: SpanStatusCode.ERROR, message: result.outcome });
        }

        if (result.returns === "rows") {
          span.setAttribute("db.response.returned_rows", result.rowCount);
        } else if (result.stats) {
          span.setAttribute("db.response.affected_rows", result.stats.affectedRows);
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
