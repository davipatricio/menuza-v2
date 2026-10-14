"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { formatBrl } from "@/lib/format";

type ProductRow = {
  id: string;
  name: string;
  categoryName: string | null;
  priceCents: number | null;
  available: boolean;
};

export function ProductsTable({ products }: { products: ProductRow[] }) {
  const columns: ColumnDef<typeof dashboardTableFeatures, ProductRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "categoryName", header: "Categoria", cell: ({ row }) => row.original.categoryName ?? "—" },
    { accessorKey: "priceCents", header: "Preço", cell: ({ row }) => (row.original.priceCents === null ? "—" : formatBrl(row.original.priceCents)) },
    { accessorKey: "available", header: "Disponível", cell: ({ row }) => (row.original.available ? "Sim" : "Não") },
  ];

  return (
    <DataTable<ProductRow>
      columns={columns}
      data={products}
      searchLabel="Buscar produtos"
      searchPlaceholder="Buscar por nome ou categoria."
      tableLabel="Produtos"
    />
  );
}
