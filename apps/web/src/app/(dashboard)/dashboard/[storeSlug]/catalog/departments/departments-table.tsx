"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";

type DepartmentRow = {
  id: string;
  name: string;
  itemsCount: number;
};

export function DepartmentsTable({ departments }: { departments: DepartmentRow[] }) {
  const columns: ColumnDef<typeof dashboardTableFeatures, DepartmentRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "itemsCount", header: "Itens" },
  ];

  return (
    <DataTable<DepartmentRow>
      columns={columns}
      data={departments}
      searchLabel="Buscar departamentos"
      searchPlaceholder="Buscar por nome."
      tableLabel="Departamentos"
    />
  );
}
