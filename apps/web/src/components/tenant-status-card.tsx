import { getTenantStatus } from "@/lib/server-api.ts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.tsx";

export async function TenantStatusCard() {
  const status = await getTenantStatus();

  return (
    <Card aria-labelledby="tenant-status-heading">
      <CardHeader>
        <CardTitle id="tenant-status-heading">Status do serviço de gestão</CardTitle>
      </CardHeader>
      <CardContent>
        {status.ok ? (
          <p className="text-sm">
            Serviço: <span className="font-mono">{status.data.service}</span> · Resposta em{" "}
            <time dateTime={status.data.timestamp}>{status.data.timestamp}</time>
          </p>
        ) : (
          <p className="text-sm text-red-700 dark:text-red-400" role="alert">
            Falha ao contatar o serviço de gestão.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
