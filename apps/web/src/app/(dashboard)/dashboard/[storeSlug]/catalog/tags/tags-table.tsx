"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";

type TagRow = {
  id: string;
  name: string;
  itemsCount: number;
};

export function TagsTable({ tags }: { tags: TagRow[] }) {
  const columns: ColumnDef<typeof dashboardTableFeatures, TagRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "itemsCount", header: "Itens" },
  ];

  return (
    <DataTable<TagRow>
      columns={columns}
      data={tags}
      searchLabel="Buscar tags"
      searchPlaceholder="Buscar por nome."
      tableLabel="Tags"
    />
  );
}
