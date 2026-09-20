"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table.tsx";
import { type AuditLogItem, MOCK_AUDIT_LOGS } from "@/lib/mock-management-data.ts";

const columns: ColumnDef<AuditLogItem>[] = [
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

export default function AuditManagePage() {
  return (
    <section aria-labelledby="audit-heading" className="space-y-6">
      <div>
        <h2 id="audit-heading" className="text-2xl font-semibold tracking-tight">
          Auditoria
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Trilha de eventos e operações administrativas (dados demonstrativos UI-only).
        </p>
      </div>

      <DataTable
        columns={columns}
        data={MOCK_AUDIT_LOGS}
        searchPlaceholder="Buscar por ação ou autor…"
        searchLabel="Filtrar auditoria"
        exportFilename="auditoria-menuza"
        exportColumns={[
          { key: "timestamp", label: "Data/Hora" },
          { key: "actor", label: "Autor" },
          { key: "action", label: "Ação" },
          { key: "target", label: "Alvo" },
          { key: "ip", label: "IP" },
        ]}
      />
    </section>
  );
}
