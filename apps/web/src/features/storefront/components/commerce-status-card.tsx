import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import type { CommerceStatus } from "@/features/storefront/lib/commerce-status.ts";

/** The deferred commerce health read, rendered inside `<Await>`. */
export function CommerceStatusCard({ status }: { status: CommerceStatus }) {
  return (
    <Card aria-labelledby="commerce-status-heading">
      <CardHeader>
        <CardTitle id="commerce-status-heading">Status do serviço de comércio</CardTitle>
      </CardHeader>
      <CardContent>
        {status.ok ? (
          <p className="text-sm">
            Serviço: <span className="font-mono">{status.data.service}</span> · Resposta em{" "}
            <time dateTime={status.data.timestamp}>{status.data.timestamp}</time>
          </p>
        ) : (
          <p className="text-sm text-destructive" role="alert">
            Falha ao contatar o serviço de comércio.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Placeholder while the health read streams in. */
export function CommerceStatusSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader>
        <CardTitle>Status do serviço de comércio</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Verificando…</p>
      </CardContent>
    </Card>
  );
}
