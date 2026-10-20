"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { Input } from "@/components/ui/input.tsx";
import { TaxonomyRowActions } from "../_components/taxonomy-dialog.tsx";

type TagRow = { id: string; name: string; itemsCount: number };

export function TagsTable({ tags, storeSlug }: { tags: TagRow[]; storeSlug: string }) {
  const [query, setQuery] = useState("");
  const [usedOnly, setUsedOnly] = useState(false);
  const [minItems, setMinItems] = useState("");

  const filtered = useMemo(() => {
    const min = Number(minItems || 0);

    return tags.filter((tag) => {
      if (query.trim() && !tag.name.toLowerCase().includes(query.trim().toLowerCase()))
        return false;

      if (usedOnly && tag.itemsCount === 0) return false;

      if (minItems !== "" && tag.itemsCount < min) return false;

      return true;
    });
  }, [tags, query, usedOnly, minItems]);

  const columns: ColumnDef<typeof dashboardTableFeatures, TagRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "itemsCount", header: "Itens" },
    {
      id: "actions",
      header: "Ações",
      cell: ({ row }) => (
        <TaxonomyRowActions
          entity="tag"
          storeSlug={storeSlug}
          row={row.original}
          sortOrder={tags.findIndex((tag) => tag.id === row.original.id)}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar tags por nome."
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={usedOnly}
            onCheckedChange={(checked) => setUsedOnly(Boolean(checked))}
          />{" "}
          Somente com itens
        </label>
        <label htmlFor="tags-min-items" className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Itens mínimos</span>
          <Input
            id="tags-min-items"
            type="number"
            min={0}
            value={minItems}
            onChange={(event) => setMinItems(event.target.value)}
            className="w-24"
          />
        </label>
        <button
          type="button"
          className="h-9 rounded-md border px-3 text-sm"
          onClick={() => {
            setQuery("");
            setUsedOnly(false);
            setMinItems("");
          }}
        >
          Limpar filtros
        </button>
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {tags.length} itens
        </p>
      </div>
      <DataTable<TagRow> columns={columns} data={filtered} hideToolbar tableLabel="Tags" />
    </div>
  );
}
