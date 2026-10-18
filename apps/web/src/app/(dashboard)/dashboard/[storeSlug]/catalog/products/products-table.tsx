"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { formatBrl } from "@/lib/format";

type ProductRow = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  tags: { id: string; name: string }[];
  priceCents: number | null;
  available: boolean;
};

type Mode = "any" | "all";

export function ProductsTable({ products }: { products: ProductRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [categoryId, setCategoryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<Mode>("any");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [pricedOnly, setPricedOnly] = useState(false);
  const [untaggedOnly, setUntaggedOnly] = useState(false);

  const categories = useMemo(() => {
    const map = new Map<string, string>();

    for (const product of products) {
      if (!product.categoryId || !product.categoryName) continue;

      if (!map.has(product.categoryId)) map.set(product.categoryId, product.categoryName);
    }

    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [products]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();

    for (const product of products) {
      if (!product.departmentId || !product.departmentName) continue;

      if (!map.has(product.departmentId)) map.set(product.departmentId, product.departmentName);
    }

    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [products]);

  const tags = useMemo(() => {
    const map = new Map<string, string>();

    for (const product of products)
      for (const tag of product.tags) if (!map.has(tag.id)) map.set(tag.id, tag.name);

    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      if (normalizedQuery) {
        const haystack = [
          product.name,
          product.categoryName,
          product.departmentName,
          ...product.tags.map((tag) => tag.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedQuery)) return false;
      }

      if (status === "active" && !product.available) return false;

      if (status === "inactive" && product.available) return false;

      if (availableOnly && !product.available) return false;

      if (pricedOnly && product.priceCents === null) return false;

      if (untaggedOnly && product.tags.length > 0) return false;

      if (categoryId && product.categoryId !== categoryId) return false;

      if (departmentId && product.departmentId !== departmentId) return false;

      if (selectedTags.length > 0) {
        const productTagIds = new Set(product.tags.map((tag) => tag.id));
        const matchingTags = selectedTags.filter((tag) => productTagIds.has(tag));
        const hasAll = matchingTags.length === selectedTags.length;
        const hasAny = matchingTags.length > 0;

        if (tagMode === "any" && !hasAny) return false;

        if (tagMode === "all" && !hasAll) return false;
      }

      return true;
    });
  }, [
    products,
    query,
    status,
    availableOnly,
    pricedOnly,
    untaggedOnly,
    categoryId,
    departmentId,
    selectedTags,
    tagMode,
  ]);

  const columns: ColumnDef<typeof dashboardTableFeatures, ProductRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    {
      accessorKey: "categoryName",
      header: "Categoria",
      cell: ({ row }) => row.original.categoryName ?? "—",
    },
    {
      accessorKey: "departmentName",
      header: "Departamento",
      cell: ({ row }) => row.original.departmentName ?? "—",
    },
    {
      id: "tags",
      header: "Tags",
      cell: ({ row }) =>
        row.original.tags.length ? row.original.tags.map((tag) => tag.name).join(", ") : "—",
    },
    {
      accessorKey: "priceCents",
      header: "Preço",
      cell: ({ row }) =>
        row.original.priceCents === null ? "—" : formatBrl(row.original.priceCents),
    },
    {
      accessorKey: "available",
      header: "Disponível",
      cell: ({ row }) => (row.original.available ? "Sim" : "Não"),
    },
  ];

  const toggleTag = (tagId: string) => {
    setSelectedTags((previous) =>
      previous.includes(tagId) ? previous.filter((item) => item !== tagId) : [...previous, tagId],
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome, categoria, departamento ou tag."
        />
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="products-status" className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Disponibilidade</span>
            <select
              id="products-status"
              value={status}
              // SAFETY: the only <option> values are "all", "active" and "inactive",
              // so the DOM can only produce one of them.
              onChange={(event) => setStatus(event.target.value as "all" | "active" | "inactive")}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
          <label htmlFor="products-category" className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Categoria</span>
            <select
              id="products-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-9 min-w-[180px] rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="products-department" className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Departamento</span>
            <select
              id="products-department"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="h-9 min-w-[180px] rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Todos</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <Popover>
            <PopoverTrigger className="h-9 rounded-md border px-3 text-sm">
              Tags ({selectedTags.length})
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-xs ${tagMode === "any" ? "bg-primary text-primary-foreground" : "border"}`}
                    onClick={() => setTagMode("any")}
                  >
                    Qualquer
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-xs ${tagMode === "all" ? "bg-primary text-primary-foreground" : "border"}`}
                    onClick={() => setTagMode("all")}
                  >
                    Todas
                  </button>
                </div>
                <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedTags.includes(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      {tag.name}
                    </label>
                  ))}
                  {tags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem tags.</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setSelectedTags([])}
                >
                  Limpar tags
                </button>
              </div>
            </PopoverContent>
          </Popover>
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="products-available-only"
              checked={availableOnly}
              onCheckedChange={(checked) => setAvailableOnly(Boolean(checked))}
            />
            <FieldLabel htmlFor="products-available-only">Somente ativos</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="products-priced-only"
              checked={pricedOnly}
              onCheckedChange={(checked) => setPricedOnly(Boolean(checked))}
            />
            <FieldLabel htmlFor="products-priced-only">Somente com preço</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="products-untagged-only"
              checked={untaggedOnly}
              onCheckedChange={(checked) => setUntaggedOnly(Boolean(checked))}
            />
            <FieldLabel htmlFor="products-untagged-only">Somente sem tags</FieldLabel>
          </Field>
          <button
            type="button"
            className="h-9 rounded-md border px-3 text-sm"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setCategoryId("");
              setDepartmentId("");
              setSelectedTags([]);
              setTagMode("any");
              setAvailableOnly(false);
              setPricedOnly(false);
              setUntaggedOnly(false);
            }}
          >
            Limpar filtros
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {filteredProducts.length} de {products.length} itens
        </p>
      </div>

      <DataTable columns={columns} data={filteredProducts} hideToolbar tableLabel="Produtos" />
    </div>
  );
}
