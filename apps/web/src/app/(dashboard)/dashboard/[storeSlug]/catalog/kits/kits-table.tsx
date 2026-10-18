"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";

type KitRow = { id: string; name: string; mode: string; available: boolean; itemsCount: number };

export function KitsTable({ kits }: { kits: KitRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [mode, setMode] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [usedOnly, setUsedOnly] = useState(false);
  const [minItems, setMinItems] = useState("");

  const modes = useMemo(() => [...new Set(kits.map((kit) => kit.mode))].sort(), [kits]);

  const filtered = useMemo(() => {
    const min = Number(minItems || 0);

    return kits.filter((kit) => {
      if (query.trim() && !kit.name.toLowerCase().includes(query.trim().toLowerCase()))
        return false;

      if (status === "active" && !kit.available) return false;

      if (status === "inactive" && kit.available) return false;

      if (availableOnly && !kit.available) return false;

      if (mode && kit.mode !== mode) return false;

      if (usedOnly && kit.itemsCount === 0) return false;

      if (minItems !== "" && kit.itemsCount < min) return false;

      return true;
    });
  }, [kits, query, status, availableOnly, mode, usedOnly, minItems]);

  const columns: ColumnDef<typeof dashboardTableFeatures, KitRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    { accessorKey: "mode", header: "Modo" },
    { accessorKey: "itemsCount", header: "Itens" },
    {
      accessorKey: "available",
      header: "Disponível",
      cell: ({ row }) => (row.original.available ? "Sim" : "Não"),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar kits por nome."
          className="max-w-sm"
        />
        <label htmlFor="kits-status" className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Disponibilidade</span>
          <select
            id="kits-status"
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
        <label htmlFor="kits-mode" className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Modo</span>
          <select
            id="kits-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            className="h-9 min-w-[140px] rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Todos</option>
            {modes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <Field orientation="horizontal" className="w-auto">
          <Checkbox
            id="kits-available-only"
            checked={availableOnly}
            onCheckedChange={(checked) => setAvailableOnly(Boolean(checked))}
          />
          <FieldLabel htmlFor="kits-available-only">Somente ativos</FieldLabel>
        </Field>
        <Field orientation="horizontal" className="w-auto">
          <Checkbox
            id="kits-used-only"
            checked={usedOnly}
            onCheckedChange={(checked) => setUsedOnly(Boolean(checked))}
          />
          <FieldLabel htmlFor="kits-used-only">Somente com itens</FieldLabel>
        </Field>
        <label htmlFor="kits-min-items" className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Itens mínimos</span>
          <Input
            id="kits-min-items"
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
            setStatus("all");
            setMode("");
            setAvailableOnly(false);
            setUsedOnly(false);
            setMinItems("");
          }}
        >
          Limpar filtros
        </button>
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {kits.length} itens
        </p>
      </div>
      <DataTable<KitRow> columns={columns} data={filtered} hideToolbar tableLabel="Kits" />
    </div>
  );
}
