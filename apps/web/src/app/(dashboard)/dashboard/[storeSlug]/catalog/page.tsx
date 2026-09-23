"use client";

import { useMemo } from "react";
import { notFound, useParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
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
import {
  getStore,
  getStoreCategories,
  getStoreProducts,
  type CatalogProduct,
} from "@/lib/mock-dashboard-data.ts";
import { EmptyState } from "../_components/empty-state.tsx";

const productColumns: ColumnDef<typeof dashboardTableFeatures, CatalogProduct, unknown>[] = [
  {
    accessorKey: "name",
    header: "Produto",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "category",
    header: "Categoria",
  },
  {
    accessorKey: "price",
    header: "Preço",
    cell: ({ row }) => <span className="tabular-nums">{formatBrl(row.original.price)}</span>,
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

export default function CatalogPage() {
  const params = useParams<{ storeSlug: string }>();
  const storeSlug = params.storeSlug ?? "";
  const store = getStore(storeSlug);

  const categories = useMemo(() => (store ? getStoreCategories(store.slug) : []), [store]);
  const products = useMemo(() => (store ? getStoreProducts(store.slug) : []), [store]);

  const categoryFilterOptions = useMemo(
    () => categories.map((entry) => ({ value: entry.name, label: entry.name })),
    [categories],
  );

  if (!store) notFound();

  return (
    <section aria-labelledby="catalog-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="catalog-heading" className="text-xl font-semibold tracking-tight">
          Catálogo
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Produtos e categorias de {store.displayName} (dados demonstrativos).
        </p>
      </div>

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
              exportFilename={`catalogo-${store.slug}`}
              exportColumns={[
                { key: "name", label: "Produto" },
                { key: "category", label: "Categoria" },
                { key: "price", label: "Preço", accessor: (r) => r.price.toFixed(2) },
                {
                  key: "available",
                  label: "Disponibilidade",
                  accessor: (r) => (r.available ? "Disponível" : "Indisponível"),
                },
              ]}
              filterColumn="category"
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
            <EmptyState>
              Nenhuma categoria ainda. As categorias do cardápio aparecem aqui.
            </EmptyState>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
