"use client";

import { notFound, useParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table.tsx";
import { dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { getStore, getStoreAuditLogs } from "@/lib/mock-dashboard-data.ts";
import type { AuditLogItem } from "@/lib/mock-store-data.ts";
import { EmptyState } from "../_components/empty-state.tsx";

const columns: ColumnDef<typeof dashboardTableFeatures, AuditLogItem, unknown>[] = [
  {
    accessorKey: "timestamp",
    header: "Data/Hora",
  },
  {
    accessorKey: "actor",
    header: "Autor",
  },
  {
    accessorKey: "action",
    header: "Ação",
  },
  {
    accessorKey: "target",
    header: "Alvo",
  },
  {
    accessorKey: "ip",
    header: "IP",
  },
];

export default function AuditPage() {
  const params = useParams<{ storeSlug: string }>();
  const storeSlug = params.storeSlug ?? "";
  const store = getStore(storeSlug);

  if (!store) notFound();

  const logs = getStoreAuditLogs(store.slug);

  return (
    <section aria-labelledby="audit-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="audit-heading" className="text-xl font-semibold tracking-tight">
          Auditoria
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Trilha de eventos de {store.displayName} (dados demonstrativos).
        </p>
      </div>

      {logs.length ? (
        <DataTable
          columns={columns}
          data={logs}
          tableLabel="Auditoria"
          searchPlaceholder="Buscar por ação ou autor…"
          searchLabel="Filtrar auditoria"
          exportFilename={`auditoria-${store.slug}`}
          exportColumns={[
            { key: "timestamp", label: "Data/Hora" },
            { key: "actor", label: "Autor" },
            { key: "action", label: "Ação" },
            { key: "target", label: "Alvo" },
            { key: "ip", label: "IP" },
          ]}
        />
      ) : (
        <EmptyState>Nenhum evento ainda. A trilha de eventos da loja aparece aqui.</EmptyState>
      )}
    </section>
  );
}
