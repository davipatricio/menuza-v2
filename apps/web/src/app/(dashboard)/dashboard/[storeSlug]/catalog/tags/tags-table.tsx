"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { tenantContractObject } from "@menuza/shared/tenant";
import { useMutation } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { TaxonomyRowActions } from "../_components/taxonomy-dialog.tsx";
import { tagSearchParams } from "./tags-search-params.ts";

type TagRow = { id: string; name: string; itemsCount: number; isActive: boolean };

type StatusFilter = "all" | "active" | "inactive";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

function matchesStatus(status: StatusFilter, isActive: boolean) {
  if (status === "active") return isActive;

  if (status === "inactive") return !isActive;

  return true;
}

function matchesFilters(tag: TagRow, term: string, status: StatusFilter, usedOnly: boolean) {
  if (term && !tag.name.toLowerCase().includes(term)) return false;

  if (!matchesStatus(status, tag.isActive)) return false;

  if (usedOnly && tag.itemsCount === 0) return false;

  return true;
}

export function TagsTable({ tags, storeSlug }: { tags: TagRow[]; storeSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [{ sort, order }, setSort] = useQueryStates(tagSearchParams, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [usedOnly, setUsedOnly] = useState(false);
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const [switchError, setSwitchError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return tags.filter((tag) => matchesFilters(tag, term, status, usedOnly));
  }, [tags, query, status, usedOnly]);

  const hasFilters = query !== "" || status !== "all" || usedOnly;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allSelected = filtered.length > 0 && filtered.every((row) => selectedSet.has(row.id));

  const someSelected = selectedIds.length > 0;

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : filtered.map((row) => row.id));
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  };

  const activeMutation = useMutation({
    mutationFn: ({ tagId, name, isActive }: { tagId: string; name: string; isActive: boolean }) =>
      client().panel.updateTag({ storeSlug, tagId, name, isActive }),
    onMutate: ({ tagId, isActive }) => {
      setActiveOverrides((current) => ({ ...current, [tagId]: isActive }));
    },
    onSuccess: () => {
      setSwitchError(null);
      router.refresh();
    },
    onError: (_error, { tagId }) => {
      setActiveOverrides((current) => {
        const next = { ...current };
        delete next[tagId];

        return next;
      });
      setSwitchError("Não foi possível alterar a tag. Tente novamente.");
    },
  });

  const activeSwitch = (tag: TagRow) => {
    const checked = activeOverrides[tag.id] ?? tag.isActive;

    const pending = activeMutation.isPending && activeMutation.variables?.tagId === tag.id;

    return (
      <Switch
        size="sm"
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) =>
          activeMutation.mutate({ tagId: tag.id, name: tag.name, isActive: next })
        }
        aria-label={checked ? `Desativar a tag ${tag.name}` : `Ativar a tag ${tag.name}`}
      />
    );
  };

  const serverSort = {
    sort,
    order,
    columns: { name: "name", itemsCount: "itemsCount" },
    onSort: (key: string) => {
      // SAFETY: DataTable only calls this with keys declared in `columns`.
      const sortKey = key as typeof sort;

      void setSort({
        sort: sortKey,
        order: sort === sortKey && order === "asc" ? "desc" : "asc",
      });
    },
  };

  const columns: ColumnDef<typeof dashboardTableFeatures, TagRow, unknown>[] = [
    {
      id: "select",
      meta: { width: 32 },
      enableSorting: false,
      header: () => (
        <Checkbox
          aria-label={allSelected ? "Desmarcar todas as tags" : "Selecionar todas as tags"}
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
      header: () => <span className="sr-only">Ativa</span>,
      cell: ({ row }) => activeSwitch(row.original),
    },
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "itemsCount",
      header: "Itens",
      cell: ({ row }) => {
        const { id, name, itemsCount } = row.original;

        if (itemsCount === 0) return <span className="text-muted-foreground tabular-nums">0</span>;

        return (
          <Link
            href={`/dashboard/${storeSlug}/catalog/products?tags=${encodeURIComponent(id)}`}
            className="tabular-nums underline underline-offset-4"
            aria-label={`Ver ${itemsCount} produtos da tag ${name}`}
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
        <TaxonomyRowActions
          entity="tag"
          storeSlug={storeSlug}
          row={{ id: row.original.id, name: row.original.name, active: row.original.isActive }}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
          <InputGroup className="max-w-sm min-w-[16rem] flex-1">
            <InputGroupAddon align="inline-start">
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar tags por nome…"
              aria-label="Buscar tags"
            />
          </InputGroup>

          <ToggleGroup
            variant="outline"
            aria-label="Situação das tags"
            value={[status]}
            onValueChange={(next) => {
              const selected = next[0];

              if (selected === "all" || selected === "active" || selected === "inactive")
                setStatus(selected);
            }}
          >
            <ToggleGroupItem value="all">Todos</ToggleGroupItem>
            <ToggleGroupItem value="active">Ativas</ToggleGroupItem>
            <ToggleGroupItem value="inactive">Inativas</ToggleGroupItem>
          </ToggleGroup>

          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="tags-used-only"
              checked={usedOnly}
              onCheckedChange={(checked) => setUsedOnly(Boolean(checked))}
            />
            <FieldLabel htmlFor="tags-used-only">Somente com itens</FieldLabel>
          </Field>

          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setUsedOnly(false);
              }}
            >
              <X data-icon="inline-start" aria-hidden="true" />
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} de {tags.length} itens
        </p>
      </div>

      {switchError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível alterar a tag</AlertTitle>
          <AlertDescription>{switchError}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable<TagRow>
        columns={columns}
        data={filtered}
        hideToolbar
        serverSort={serverSort}
        tableLabel="Tags"
      />
    </div>
  );
}
