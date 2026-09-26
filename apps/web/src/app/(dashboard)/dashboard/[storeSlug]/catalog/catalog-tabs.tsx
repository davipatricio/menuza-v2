"use client";

/**
 * Catalog tabs (Produtos / Categorias). A client island: the server page reads
 * both lists and hands them down, so the tab switch never refetches.
 */
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PanelCategory, PanelProduct } from "@menuza/shared/tenant";
import { Badge } from "@/components/ui/badge.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { formatBrl } from "@/lib/format.ts";
import { EmptyState } from "../_components/empty-state.tsx";

const productColumns: ColumnDef<typeof dashboardTableFeatures, PanelProduct, unknown>[] = [
  {
    accessorKey: "name",
    header: "Produto",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "categoryName",
    header: "Categoria",
  },
  {
    accessorKey: "priceCents",
    header: "Preço",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.priceCents === null ? "—" : formatBrl(row.original.priceCents)}
      </span>
    ),
  },
  {
    accessorKey: "available",
    header: "Disponibilidade",
    cell: ({ row }) =>
      row.original.available ? (
        <Badge>Disponível</Badge>
      ) : (
        <Badge variant="secondary">Indisponível</Badge>
      ),
  },
];

export function CatalogTabs({
  products,
  categories,
  storeSlug,
}: {
  products: PanelProduct[];
  categories: PanelCategory[];
  storeSlug: string;
}) {
  const categoryFilterOptions = useMemo(
    () => categories.map((entry) => ({ value: entry.name, label: entry.name })),
    [categories],
  );

  return (
    <Tabs defaultValue="products">
      <TabsList aria-label="Seções do catálogo">
        <TabsTrigger value="products">Produtos</TabsTrigger>
        <TabsTrigger value="categories">Categorias</TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="flex flex-col gap-4">
        {products.length ? (
          <DataTable
            columns={productColumns}
            data={products}
            tableLabel="Produtos"
            searchPlaceholder="Buscar produto…"
            searchLabel="Filtrar produtos"
            exportFilename={`catalogo-${storeSlug}`}
            exportColumns={[
              { key: "name", label: "Produto" },
              { key: "categoryName", label: "Categoria" },
              {
                key: "priceCents",
                label: "Preço",
                accessor: (r) => (r.priceCents === null ? "" : (r.priceCents / 100).toFixed(2)),
              },
              {
                key: "available",
                label: "Disponibilidade",
                accessor: (r) => (r.available ? "Disponível" : "Indisponível"),
              },
            ]}
            filterColumn="categoryName"
            filterOptions={categoryFilterOptions}
            filterPlaceholder="Categoria…"
            filterLabel="Filtrar por categoria"
          />
        ) : (
          <EmptyState>Nenhum produto ainda. Os produtos do cardápio aparecem aqui.</EmptyState>
        )}
      </TabsContent>

      <TabsContent value="categories">
        {categories.length ? (
          <div className="overflow-hidden rounded-xl border border-border shadow-surface">
            <Table aria-label="Categorias">
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Itens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell className="tabular-nums">{entry.itemsCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState>Nenhuma categoria ainda. As categorias do cardápio aparecem aqui.</EmptyState>
        )}
      </TabsContent>
    </Tabs>
  );
}
