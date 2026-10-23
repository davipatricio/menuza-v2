"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { TaxonomyRowActions } from "../_components/taxonomy-dialog.tsx";

type DepartmentRow = { id: string; name: string; active: boolean; itemsCount: number };

type StatusFilter = "all" | "active" | "inactive";

export function DepartmentsTable({
  departments,
  storeSlug,
}: {
  departments: DepartmentRow[];
  storeSlug: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return departments
      .filter((department) => {
        if (term && !department.name.toLowerCase().includes(term)) return false;

        if (status === "active" && !department.active) return false;

        if (status === "inactive" && department.active) return false;

        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id, "pt-BR"));
  }, [departments, query, status]);

  const hasFilters = query.trim() !== "" || status !== "all";

  const columns: ColumnDef<typeof dashboardTableFeatures, DepartmentRow, unknown>[] = [
    { accessorKey: "name", header: "Nome" },
    {
      id: "active",
      header: "Status",
      cell: ({ row }) =>
        row.original.active ? (
          <Badge variant="secondary">Ativo</Badge>
        ) : (
          <Badge variant="outline">Inativo</Badge>
        ),
    },
    {
      accessorKey: "itemsCount",
      header: "Itens",
      cell: ({ row }) => {
        const { id, name, itemsCount } = row.original;
        const noun = itemsCount === 1 ? "produto" : "produtos";

        return (
          <Link
            href={`/dashboard/${storeSlug}/catalog/products?department=${encodeURIComponent(id)}`}
            className="tabular-nums underline-offset-4 hover:underline"
            aria-label={`Ver ${itemsCount} ${noun} do departamento ${name}`}
          >
            {itemsCount}
          </Link>
        );
      },
    },
    {
      id: "actions",
      header: "Ações",
      cell: ({ row }) => (
        <TaxonomyRowActions entity="department" storeSlug={storeSlug} row={row.original} />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="max-w-sm min-w-[16rem] flex-1">
            <InputGroupAddon align="inline-start">
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome…"
              aria-label="Buscar departamentos"
            />
          </InputGroup>

          <ToggleGroup
            variant="outline"
            aria-label="Status"
            value={[status]}
            onValueChange={(next) => {
              const selected = next[0];

              if (selected === "all" || selected === "active" || selected === "inactive")
                setStatus(selected);
            }}
          >
            <ToggleGroupItem value="all">Todos</ToggleGroupItem>
            <ToggleGroupItem value="active">Ativos</ToggleGroupItem>
            <ToggleGroupItem value="inactive">Inativos</ToggleGroupItem>
          </ToggleGroup>

          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              <X data-icon="inline-start" aria-hidden="true" />
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} de {departments.length} itens
        </p>
      </div>

      <DataTable<DepartmentRow>
        columns={columns}
        data={filtered}
        hideToolbar
        tableLabel="Departamentos"
      />
    </div>
  );
}
