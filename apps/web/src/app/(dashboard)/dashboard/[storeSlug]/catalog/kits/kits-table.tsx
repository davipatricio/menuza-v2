"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";

type KitRow = {
  id: string;
  name: string;
  mode: string;
  available: boolean;
  itemsCount: number;
};

export function KitsTable({ kits }: { kits: KitRow[] }) {
  const columns: ColumnDef<typeof dashboardTableFeatures, KitRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "mode", header: "Modo" },
    { accessorKey: "itemsCount", header: "Itens" },
    { accessorKey: "available", header: "Disponível", cell: ({ row }) => (row.original.available ? "Sim" : "Não") },
  ];

  return (
    <DataTable<KitRow>
      columns={columns}
      data={kits}
      searchLabel="Buscar kits"
      searchPlaceholder="Buscar por nome."
      tableLabel="Kits"
    />
  );
}
