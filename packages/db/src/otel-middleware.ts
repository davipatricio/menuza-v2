/**
 * Prisma 8 SQL middleware that records one span per query/execute.
 *
 * A span is only created when one is already active, so startup probes,
 * scripts, and migrations stay out of the traces. Queries correlate to their
 * span through the activity id — the runtime's own per-statement identity —
 * not through async context, which is not guaranteed across the
 * row-consumption boundary.
 *
 * The plan this runtime hands over is an AST (`{ ast, params, meta }`), not
 * rendered SQL, so the span carries the verb from `ast.kind` and never the
 * statement text or the bound parameters. That is the stronger privacy
 * position: no literal can reach a span, by construction.
 */
import { SpanKind, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import type { SqlMiddleware, StatementActivity } from "@prisma/orm-postgres/family-runtime";

const DB_SYSTEM = "postgresql";

/** A span plus the abort wiring needed to detach it when the query ends. */
interface LiveSpan {
  readonly span: Span;
  readonly signal?: AbortSignal;
  readonly onAbort: () => void;
}

/** A statement activity narrowed to the plan the SQL lane executes. */
type AstStatementActivity = StatementActivity & {
  readonly plan: { readonly ast?: { readonly kind?: string } };
};

/**
 * The SQL verb of a statement activity, or `QUERY` when the plan carries no
 * AST. A statement the tracer cannot describe is still traced — it just does
 * not claim a verb — because losing the span would hide the query entirely.
 */
function operationOf(activity: StatementActivity): string {
  // SAFETY: the SQL lane's plan carries an `ast` node whose `kind` is the verb.
  // The activity union widens `plan` to `QueryPlan`, which does not declare it,
  // so the concrete plan is read back here.
  const statement = activity as AstStatementActivity;

  return statement.plan.ast?.kind?.toUpperCase() ?? "QUERY";
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

    const operation = operationOf(activity);

    const span = tracer.startSpan(`db ${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system": DB_SYSTEM,
        "db.operation.name": operation,
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
