/**
 * Lista de kits. O endpoint devolve todos os kits da loja, então o filtro roda
 * no cliente; o estado mora na URL para sobreviver a recarregar e a um link
 * compartilhado. A escrita da linha é só o interruptor de disponibilidade: o
 * resto acontece no editor.
 */
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Link, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { debounce, useQueryStates } from "nuqs";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
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
import { formatBrl, formatDateTime } from "@/lib/format.ts";
import { KIT_KIND_LABELS } from "@/lib/panel-labels.ts";
import type { PanelKit } from "@/lib/api/model/panelKit.ts";
import { setKitAvailableFn } from "../server/kit-mutations.functions.ts";
import { kitSearchParams } from "../schemas/kit-search.ts";

const KIND_OPTIONS = [
  { value: "fixed", label: KIT_KIND_LABELS.fixed },
  { value: "custom_quantities", label: KIT_KIND_LABELS.custom_quantities },
  { value: "fixed_total", label: KIT_KIND_LABELS.fixed_total },
] as const;

export function KitsTable({ kits, storeSlug }: { kits: PanelKit[]; storeSlug: string }) {
  const router = useRouter();

  const [filters, setFilters] = useQueryStates(kitSearchParams, {
    history: "replace",
    scroll: false,
  });

  const [switchError, setSwitchError] = useState<string | null>(null);

  const { q, status, kind } = filters;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return kits.filter((kit) => {
      if (needle !== "" && !kit.name.toLowerCase().includes(needle)) return false;

      if (status === "active" && (kit.archived || !kit.available)) return false;

      if (status === "archived" && !kit.archived) return false;

      if (kind !== "all" && kit.kind !== kind) return false;

      return true;
    });
  }, [kits, q, status, kind]);

  const availability = useMutation({
    mutationFn: (input: { kitId: string; available: boolean }) =>
      setKitAvailableFn({ data: { storeSlug, ...input } }),
    onSuccess: (result) => {
      if (result.status !== "ok") {
        setSwitchError(
          result.status === "unauthenticated"
            ? "Sua sessão expirou. Entre novamente."
            : "Não foi possível alterar a disponibilidade. Tente novamente.",
        );

        return;
      }

      setSwitchError(null);
      void router.invalidate();
    },
  });

  const columns: ColumnDef<typeof dashboardTableFeatures, PanelKit, unknown>[] = [
    {
      id: "available",
      meta: { width: 56 },
      header: () => <span className="sr-only">Disponibilidade</span>,
      cell: ({ row }) => {
        const kit = row.original;

        return (
          <Switch
            size="sm"
            checked={!kit.archived && kit.available}
            disabled={
              kit.archived || (availability.isPending && availability.variables?.kitId === kit.id)
            }
            onCheckedChange={(next) => availability.mutate({ kitId: kit.id, available: next })}
            aria-label={
              kit.available ? `Indisponibilizar ${kit.name}` : `Disponibilizar ${kit.name}`
            }
          />
        );
      },
    },
    {
      accessorKey: "name",
      header: "Kit",
      cell: ({ row }) => (
        <Link
          to="/dashboard/$storeSlug/catalog/kits/$kitId"
          params={{ storeSlug, kitId: row.original.id }}
          preload="intent"
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "kind",
      header: "Tipo",
      cell: ({ row }) => KIT_KIND_LABELS[row.original.kind],
    },
    {
      accessorKey: "itemsCount",
      header: "Pratos",
      cell: ({ row }) => <span className="tabular-nums">{row.original.itemsCount}</span>,
    },
    {
      accessorKey: "baseCents",
      header: "Preço",
      cell: ({ row }) =>
        row.original.baseCents === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">{formatBrl(row.original.baseCents)}</span>
        ),
    },
    {
      accessorKey: "updatedAt",
      meta: { width: 160 },
      header: "Última edição",
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDateTime(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const kit = row.original;

        if (kit.archived) return <Badge variant="secondary">Arquivado</Badge>;

        return kit.available ? (
          <Badge>Disponível</Badge>
        ) : (
          <Badge variant="secondary">Indisponível</Badge>
        );
      },
    },
  ];

  const hasFilters = q.trim() !== "" || status !== "all" || kind !== "all";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
            aria-label="Buscar kits"
          />
          {availability.isPending ? (
            <InputGroupAddon align="inline-end">
              <Spinner aria-label="Salvando" />
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        <ToggleGroup
          variant="outline"
          aria-label="Status"
          value={[status]}
          onValueChange={(next) => {
            const selected = next[0];

            if (selected === "all" || selected === "active" || selected === "archived")
              void setFilters({ status: selected });
          }}
        >
          <ToggleGroupItem value="all">Todos</ToggleGroupItem>
          <ToggleGroupItem value="active">Disponíveis</ToggleGroupItem>
          <ToggleGroupItem value="archived">Arquivados</ToggleGroupItem>
        </ToggleGroup>

        <Popover>
          <PopoverTrigger
            render={<Button variant="outline" />}
            aria-label={kind !== "all" ? "Filtros (1)" : "Filtros"}
          >
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
            Filtros
            {kind !== "all" ? (
              <Badge variant="secondary" className="ml-1 tabular-nums">
                1
              </Badge>
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] gap-4 p-4">
            <PopoverHeader>
              <PopoverTitle>Filtrar kits</PopoverTitle>
              <PopoverDescription>Refine a lista pelo tipo de composição.</PopoverDescription>
            </PopoverHeader>

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="kits-kind">Tipo</FieldLabel>
                <Select
                  items={[{ value: "all", label: "Todos os tipos" }, ...KIND_OPTIONS]}
                  value={kind}
                  onValueChange={(next) => {
                    if (
                      next === "all" ||
                      next === "fixed" ||
                      next === "custom_quantities" ||
                      next === "fixed_total"
                    )
                      void setFilters({ kind: next });
                  }}
                >
                  <SelectTrigger id="kits-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {KIND_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </PopoverContent>
        </Popover>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void setFilters({ q: null, status: null, kind: null })}
          >
            <X data-icon="inline-start" aria-hidden="true" />
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {switchError ? (
        <Alert variant="destructive" role="status">
          <AlertTitle>Não foi possível salvar</AlertTitle>
          <AlertDescription>{switchError}</AlertDescription>
        </Alert>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {filtered.length} de {kits.length} {kits.length === 1 ? "kit" : "kits"}
      </p>

      <DataTable<PanelKit> columns={columns} data={filtered} hideToolbar tableLabel="Kits" />
    </div>
  );
}
