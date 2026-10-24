"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { tenantContractObject } from "@menuza/shared/tenant";
import { useMutation } from "@tanstack/react-query";
import { debounce, useQueryStates } from "nuqs";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { formatDateTime } from "@/lib/format";
import {
  type TaxonomyOption,
  TaxonomyFormDialog,
  TaxonomyRowActions,
} from "../_components/taxonomy-dialog.tsx";
import { categorySearchParams } from "./category-search-params.ts";

export type CategoryRow = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  itemsCount: number;
  updatedAt: string;
  departmentIds: string[];
  departmentNames: string[];
};

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

const NO_SELECTION = "none";

const SORT_OPTIONS = [
  { label: "Ordem", value: "sortOrder" },
  { label: "Nome", value: "name" },
  { label: "Itens", value: "itemsCount" },
  { label: "Última edição", value: "updatedAt" },
] as const;

function switchError(error: Error): string {
  if (error instanceof ORPCError && error.code === "CONFLICT") return error.message;

  if (error instanceof ORPCError && error.code === "FORBIDDEN")
    return "Você não tem permissão para editar o catálogo desta loja.";

  if (error instanceof ORPCError && error.code === "NOT_FOUND")
    return "Categoria não encontrada nesta loja.";

  return "Não foi possível alterar a categoria. Tente novamente.";
}

export function CategoriesTable({
  categories,
  storeSlug,
  departments,
}: {
  categories: CategoryRow[];
  storeSlug: string;
  departments: TaxonomyOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useQueryStates(categorySearchParams, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const { q, status, department, sort, order } = filters;

  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allSelected = categories.length > 0 && categories.every((row) => selectedSet.has(row.id));

  const someSelected = selectedIds.length > 0;

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : categories.map((row) => row.id));
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  };

  const activeMutation = useMutation({
    mutationFn: ({ row, active }: { row: CategoryRow; active: boolean }) =>
      client().panel.updateCategory({
        storeSlug,
        categoryId: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
        active,
        departmentIds: row.departmentIds,
      }),
    onMutate: ({ row, active }) => {
      setActiveOverrides((current) => ({ ...current, [row.id]: active }));
    },
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (mutationError, { row }) => {
      setActiveOverrides((current) => {
        const next = { ...current };
        delete next[row.id];

        return next;
      });
      setError(switchError(mutationError));
    },
  });

  const activeSwitch = (category: CategoryRow) => {
    const checked = activeOverrides[category.id] ?? category.active;

    const pending = activeMutation.isPending && activeMutation.variables?.row.id === category.id;

    return (
      <Switch
        size="sm"
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) => activeMutation.mutate({ row: category, active: next })}
        aria-label={`${checked ? "Desativar" : "Ativar"} categoria ${category.name}`}
      />
    );
  };

  const serverSort = {
    sort,
    order,
    columns: { name: "name", itemsCount: "itemsCount", updatedAt: "updatedAt" },
    onSort: (key: string) => {
      // SAFETY: DataTable only calls this with keys declared in `columns`.
      const sortKey = key as typeof sort;

      void setFilters({
        sort: sortKey,
        order: sort === sortKey && order === "asc" ? "desc" : "asc",
      });
    },
  };

  const columns: ColumnDef<typeof dashboardTableFeatures, CategoryRow, unknown>[] = [
    {
      id: "select",
      meta: { width: 32 },
      enableSorting: false,
      header: () => (
        <Checkbox
          aria-label={
            allSelected ? "Desmarcar todas as categorias" : "Selecionar todas as categorias"
          }
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={toggleAll}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Selecionar ${row.original.name}`}
          checked={selectedSet.has(row.original.id)}
          onCheckedChange={(checked) => toggleRow(row.original.id, checked)}
        />
      ),
    },
    {
      id: "active",
      enableSorting: false,
      header: () => <span className="sr-only">Status</span>,
      cell: ({ row }) => activeSwitch(row.original),
    },
    {
      accessorKey: "name",
      header: "Nome",
      enableSorting: false,
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left font-medium underline-offset-4 hover:underline"
          aria-label={`Editar categoria ${row.original.name}`}
          onClick={() => setEditing(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: "itemsCount",
      header: "Itens",
      enableSorting: false,
      cell: ({ row }) => {
        const { id, name, itemsCount } = row.original;
        const noun = itemsCount === 1 ? "produto" : "produtos";

        return (
          <Link
            href={`/dashboard/${storeSlug}/catalog/products?category=${encodeURIComponent(id)}`}
            className="tabular-nums underline-offset-4 hover:underline"
            aria-label={`Ver ${itemsCount} ${noun} da categoria ${name}`}
          >
            {itemsCount}
          </Link>
        );
      },
    },
    {
      id: "departments",
      header: "Departamentos",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.departmentNames.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.original.departmentNames.map((name, index) => (
              <Badge key={row.original.departmentIds[index] ?? name} variant="outline">
                {name}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      accessorKey: "updatedAt",
      header: "Última edição",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDateTime(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Ações",
      enableSorting: false,
      cell: ({ row }) => (
        <TaxonomyRowActions
          entity="category"
          storeSlug={storeSlug}
          row={{
            id: row.original.id,
            name: row.original.name,
            active: row.original.active,
            sortOrder: row.original.sortOrder,
            departmentIds: row.original.departmentIds,
          }}
        />
      ),
    },
  ];

  const departmentOptions = [
    { label: "Todos", value: NO_SELECTION },
    ...departments.map((option) => ({ label: option.name, value: option.id })),
  ];

  const hasFilters = q.trim() !== "" || status !== "all" || department !== "";

  const clearFilters = () => {
    void setFilters({ q: null, status: null, department: null });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
          <InputGroup className="max-w-sm min-w-[16rem] flex-1">
            <InputGroupAddon align="inline-start">
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              value={q}
              onChange={(event) => {
                const next = event.target.value;

                void setFilters(
                  { q: next },
                  { limitUrlUpdates: next === "" ? undefined : debounce(300) },
                );
              }}
              placeholder="Buscar por nome…"
              aria-label="Buscar categorias"
            />
            {isPending ? (
              <InputGroupAddon align="inline-end">
                <Spinner aria-label="Carregando categorias" />
              </InputGroupAddon>
            ) : null}
          </InputGroup>

          <ToggleGroup
            variant="outline"
            aria-label="Status"
            value={[status]}
            onValueChange={(next) => {
              const selected = next[0];

              if (selected === "all" || selected === "active" || selected === "inactive") {
                void setFilters({ status: selected });
              }
            }}
          >
            <ToggleGroupItem value="all">Todos</ToggleGroupItem>
            <ToggleGroupItem value="active">Ativos</ToggleGroupItem>
            <ToggleGroupItem value="inactive">Inativos</ToggleGroupItem>
          </ToggleGroup>

          <Select
            items={departmentOptions}
            value={department || NO_SELECTION}
            onValueChange={(next) =>
              void setFilters({
                department: next === null || next === NO_SELECTION ? null : next,
              })
            }
          >
            <SelectTrigger className="w-[11rem]" aria-label="Filtrar por departamento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {departmentOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            items={SORT_OPTIONS}
            value={sort}
            onValueChange={(next) => {
              if (
                next === "name" ||
                next === "itemsCount" ||
                next === "updatedAt" ||
                next === "sortOrder"
              ) {
                void setFilters({ sort: next });
              }
            }}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Ordenar por">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <ToggleGroup
            variant="outline"
            aria-label="Direção da ordenação"
            value={[order]}
            onValueChange={(next) => {
              const selected = next[0];

              if (selected === "asc" || selected === "desc") {
                void setFilters({ order: selected });
              }
            }}
          >
            <ToggleGroupItem value="asc" aria-label="Crescente" title="Crescente">
              <ArrowUp aria-hidden="true" />
            </ToggleGroupItem>
            <ToggleGroupItem value="desc" aria-label="Decrescente" title="Decrescente">
              <ArrowDown aria-hidden="true" />
            </ToggleGroupItem>
          </ToggleGroup>

          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              <X data-icon="inline-start" aria-hidden="true" />
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">{categories.length} itens</p>
      </div>

      {error ? (
        <Alert variant="destructive" role="status">
          <AlertTitle>Não foi possível alterar a categoria</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable<CategoryRow>
        columns={columns}
        data={categories}
        hideToolbar
        serverSort={serverSort}
        tableLabel="Categorias"
        onRowClick={(row) => setEditing(row)}
      />

      {editing ? (
        <TaxonomyFormDialog
          entity="category"
          storeSlug={storeSlug}
          row={editing}
          departments={departments}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
