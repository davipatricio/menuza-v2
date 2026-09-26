import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { EmptyState } from "../_components/empty-state.tsx";
import { AuditTable } from "./audit-table.tsx";

export default async function AuditPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { logs } = await client.panel.listAuditLogs({ storeSlug });

  return (
    <section aria-labelledby="audit-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="audit-heading" className="text-xl font-semibold tracking-tight">
          Auditoria
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">Trilha de eventos da loja.</p>
      </div>

      {logs.length ? (
        <AuditTable logs={logs} storeSlug={storeSlug} />
      ) : (
        <EmptyState>Nenhum evento ainda. A trilha de eventos da loja aparece aqui.</EmptyState>
      )}
    </section>
  );
}
