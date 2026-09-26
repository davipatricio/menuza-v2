"use client";

/**
 * Audit trail table. A client island: the server page reads the logs and hands
 * them down. `action` is a free-text slug until MEN-74 closes the event catalog.
 */
import type { ColumnDef } from "@tanstack/react-table";
import type { PanelAuditLog } from "@menuza/shared/tenant";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";

const columns: ColumnDef<typeof dashboardTableFeatures, PanelAuditLog, unknown>[] = [
  {
    accessorKey: "createdAt",
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

export function AuditTable({ logs, storeSlug }: { logs: PanelAuditLog[]; storeSlug: string }) {
  return (
    <DataTable
      columns={columns}
      data={logs}
      tableLabel="Auditoria"
      searchPlaceholder="Buscar por ação ou autor…"
      searchLabel="Filtrar auditoria"
      exportFilename={`auditoria-${storeSlug}`}
      exportColumns={[
        { key: "createdAt", label: "Data/Hora" },
        { key: "actor", label: "Autor" },
        { key: "action", label: "Ação" },
        { key: "target", label: "Alvo" },
        { key: "ip", label: "IP" },
      ]}
    />
  );
}
