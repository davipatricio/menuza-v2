"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";

type CategoryRow = {
  id: string;
  name: string;
  itemsCount: number;
};

export function CategoriesTable({ categories }: { categories: CategoryRow[] }) {
  const columns: ColumnDef<typeof dashboardTableFeatures, CategoryRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "itemsCount", header: "Itens" },
  ];

  return (
    <DataTable<CategoryRow>
      columns={columns}
      data={categories}
      searchLabel="Buscar categorias"
      searchPlaceholder="Buscar por nome."
      tableLabel="Categorias"
    />
  );
}
