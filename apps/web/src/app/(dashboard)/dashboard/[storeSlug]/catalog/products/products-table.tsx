"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  CircleCheck,
  CircleSlash,
  FolderInput,
  FolderTree,
  LayoutGrid,
  Rows3,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { debounce, useQueryStates } from "nuqs";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { tenantContractObject } from "@menuza/shared/tenant";
import type { PanelProductList } from "@menuza/shared/tenant";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import FileTree, { type FileTreeItem } from "@/components/smoothui/file-tree";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
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
import { formatBrl } from "@/lib/format";
import { HoverPrefetchLink } from "./hover-prefetch-link.tsx";
import { type ProductTaxonomy, countActiveProductFilters } from "./product-filter.ts";
import { productSearchParams } from "./product-search-params.ts";
import { TagCombobox } from "./tag-combobox.tsx";
import { TaxonomyCombobox } from "./taxonomy-combobox.tsx";

/** The explicit "no value" row both taxonomy selects need. */
const NO_SELECTION = "none";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

type BulkDialog = "tags" | "category" | "department" | "delete" | null;

type BulkUpdateInput = {
  available?: boolean;
  addTagIds?: string[];
  categoryId?: string | null;
  departmentId?: string | null;
};

function bulkMessage(error: Error): string {
  if (error instanceof ORPCError) {
    if (error.code === "FORBIDDEN")
      return "Você não tem permissão para gerenciar o catálogo nesta loja.";

    if (error.code === "NOT_FOUND")
      return "Um ou mais produtos não existem mais. Atualize a lista e tente novamente.";

    if (error.code === "CONFLICT") return error.message;

    if (error.code === "VALIDATION_FAILED" || error.code === "INVALID_INPUT")
      return "Revise a seleção e tente novamente.";
  }

  return error.message || "Não foi possível concluir a ação.";
}

function priceLabel(product: PanelProductList): string | null {
  if (product.priceMinCents === null) return null;

  const max = product.priceMaxCents;

  if (max === null || max === product.priceMinCents) {
    return formatBrl(product.priceMinCents);
  }

  return `${formatBrl(product.priceMinCents)} – ${formatBrl(max)}`;
}

function stockLabel(product: PanelProductList): string | null {
  if (product.stockQty === null) {
    return product.hasUnlimitedStock ? "Ilimitado" : null;
  }

  if (product.hasUnlimitedStock) return `${product.stockQty} + ilimitado`;

  return String(product.stockQty);
}

type ProductView = "table" | "grid" | "tree";

/** Departments > categories > products, for the tree view. */
function buildProductTree(products: PanelProductList[]): FileTreeItem[] {
  const departments = new Map<
    string,
    {
      id: string;
      name: string;
      categories: Map<string, { id: string; name: string; products: PanelProductList[] }>;
    }
  >();

  for (const product of products) {
    const departmentKey = product.departmentId ?? "none";
    let department = departments.get(departmentKey);

    if (!department) {
      department = {
        id: `department:${departmentKey}`,
        name: product.departmentName ?? "Sem departamento",
        categories: new Map(),
      };
      departments.set(departmentKey, department);
    }

    const categoryKey = product.categoryId ?? "none";
    let category = department.categories.get(categoryKey);

    if (!category) {
      category = {
        id: `category:${departmentKey}:${categoryKey}`,
        name: product.categoryName ?? "Sem categoria",
        products: [],
      };
      department.categories.set(categoryKey, category);
    }

    category.products.push(product);
  }

  return [...departments.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((department) => {
      const categories: FileTreeItem[] = [];
      let productCount = 0;

      for (const category of [...department.categories.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      )) {
        productCount += category.products.length;
        categories.push({
          id: category.id,
          name: category.name,
          type: "folder",
          badge: category.products.length,
          children: category.products.map((product) => ({
            id: `product:${product.id}`,
            name: product.name,
            type: "file",
            badge: product.available ? undefined : "Inativo",
          })),
        });
      }

      return {
        id: department.id,
        name: department.name,
        type: "folder" as const,
        badge: productCount,
        children: categories,
      };
    });
}

export function ProductsTable({
  products,
  storeSlug,
  totalCount,
  taxonomy,
}: {
  products: PanelProductList[];
  storeSlug: string;
  totalCount: number;
  taxonomy: ProductTaxonomy;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useQueryStates(productSearchParams, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const {
    q,
    status,
    visibility,
    category,
    department,
    tags: selectedTags,
    view,
    priced,
    untagged,
  } = filters;

  const { categories, departments, tags } = taxonomy;

  const setView = (next: ProductView) => {
    void setFilters({ view: next }, { shallow: true, history: "replace", scroll: false });
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [availabilityOverrides, setAvailabilityOverrides] = useState<Record<string, boolean>>({});
  const [visibleTagCount, setVisibleTagCount] = useState(5);
  const [bulkDialog, setBulkDialog] = useState<BulkDialog>(null);

  const visibleTags = tags.slice(0, visibleTagCount);
  const [tagSelection, setTagSelection] = useState<string[]>([]);
  const [taxonomySelection, setTaxonomySelection] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);

  const productIds = useMemo(() => new Set(products.map((product) => product.id)), [products]);

  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => productIds.has(id)),
    [selectedIds, productIds],
  );

  const selectedSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);

  const allSelected =
    products.length > 0 && products.every((product) => selectedSet.has(product.id));

  const someSelected = activeSelectedIds.length > 0;

  const availabilityMutation = useMutation({
    mutationFn: ({ productId, available }: { productId: string; available: boolean }) =>
      client().panel.updateProduct({ storeSlug, productId, available }),
    onMutate: ({ productId, available }) => {
      setAvailabilityOverrides((current) => ({ ...current, [productId]: available }));
    },
    onSuccess: () => {
      setBulkError(null);
      router.refresh();
    },
    onError: (error, { productId }) => {
      setAvailabilityOverrides((current) => {
        const next = { ...current };
        delete next[productId];

        return next;
      });
      setBulkError(bulkMessage(error));
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: (input: BulkUpdateInput) =>
      client().panel.bulkUpdateProducts({
        storeSlug,
        productIds: activeSelectedIds,
        ...input,
      }),
    onSuccess: ({ updated }) => {
      setBulkError(null);
      setBulkStatus(`${updated} ${updated === 1 ? "produto atualizado" : "produtos atualizados"}.`);
      setBulkDialog(null);
      setSelectedIds([]);
      router.refresh();
    },
    onError: (error) => setBulkError(bulkMessage(error)),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      client().panel.bulkDeleteProducts({ storeSlug, productIds: activeSelectedIds }),
    onSuccess: ({ deleted, skipped }) => {
      const names = skipped.slice(0, 5).map((item) => item.name);
      const extra = skipped.length > names.length ? ` e mais ${skipped.length - names.length}` : "";

      const skippedNote =
        skipped.length > 0
          ? ` ${skipped.length} ${skipped.length === 1 ? "foi mantido" : "foram mantidos"} por estar em pedidos ou kits: ${names.join(", ")}${extra}.`
          : "";

      setBulkError(null);
      setBulkStatus(
        `${deleted} ${deleted === 1 ? "produto excluído" : "produtos excluídos"}.${skippedNote}`,
      );
      setBulkDialog(null);
      setSelectedIds([]);
      router.refresh();
    },
    onError: (error) => setBulkError(bulkMessage(error)),
  });

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : products.map((product) => product.id));
  };

  const availabilitySwitch = (product: PanelProductList) => {
    const checked = availabilityOverrides[product.id] ?? product.available;

    const pending =
      availabilityMutation.isPending && availabilityMutation.variables?.productId === product.id;

    return (
      <Switch
        size="sm"
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) =>
          availabilityMutation.mutate({
            productId: product.id,
            available: next,
          })
        }
        aria-label={checked ? `Indisponibilizar ${product.name}` : `Disponibilizar ${product.name}`}
      />
    );
  };

  const treeItems = useMemo(() => buildProductTree(products), [products]);

  const openBulkDialog = (next: Exclude<BulkDialog, null>) => {
    setBulkError(null);
    setBulkStatus(null);

    if (next === "tags") setTagSelection([]);

    if (next === "category" || next === "department") setTaxonomySelection(null);

    setBulkDialog(next);
  };

  const runAvailability = (available: boolean) => {
    bulkUpdateMutation.mutate({ available });
  };

  const categoryOptions = [
    { label: "Todas", value: NO_SELECTION },
    ...categories.map((option) => ({ label: option.name, value: option.id })),
  ];

  const departmentOptions = [
    { label: "Todos", value: NO_SELECTION },
    ...departments.map((option) => ({ label: option.name, value: option.id })),
  ];

  const visibilityOptions = [
    { label: "Todas", value: "all" },
    { label: "Arquivados", value: "archived" },
    { label: "Escondidos", value: "hidden" },
    { label: "Privados", value: "private" },
  ];

  const advancedFilterCount = countActiveProductFilters(filters);

  const hasFilters = q.trim() !== "" || status !== "all" || advancedFilterCount > 0;

  const clearFilters = () => {
    void setFilters({
      q: null,
      status: null,
      visibility: null,
      category: null,
      department: null,
      tags: null,
      priced: null,
      untagged: null,
    });
  };

  const exportParams = new URLSearchParams();

  if (q) exportParams.set("q", q);

  if (status !== "all") exportParams.set("status", status);

  if (visibility !== "all") exportParams.set("visibility", visibility);

  if (category) exportParams.set("category", category);

  if (department) exportParams.set("department", department);

  if (selectedTags.length > 0) exportParams.set("tags", selectedTags.join(","));

  if (priced) exportParams.set("priced", "true");

  if (untagged) exportParams.set("untagged", "true");

  const exportQuery = exportParams.toString();

  const exportHref = `/dashboard/${storeSlug}/catalog/products/export${
    exportQuery ? `?${exportQuery}` : ""
  }`;

  const columns: ColumnDef<typeof dashboardTableFeatures, PanelProductList, unknown>[] = [
    {
      id: "select",
      meta: { width: 32 },
      header: () => (
        <Checkbox
          aria-label={allSelected ? "Desmarcar todos os produtos" : "Selecionar todos os produtos"}
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
      id: "available",
      meta: { width: 56 },
      header: () => <span className="sr-only">Disponibilidade</span>,
      cell: ({ row }) => availabilitySwitch(row.original),
    },
    {
      accessorKey: "name",
      header: "Produto",
      cell: ({ row }) => (
        <HoverPrefetchLink
          href={`/dashboard/${storeSlug}/catalog/products/${row.original.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.original.name}
        </HoverPrefetchLink>
      ),
    },
    {
      accessorKey: "priceMinCents",
      header: "Preço",
      cell: ({ row }) => {
        const label = priceLabel(row.original);

        return label === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">{label}</span>
        );
      },
    },
    {
      accessorKey: "categoryName",
      header: "Categoria",
      cell: ({ row }) =>
        row.original.categoryName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const visible = row.original.tags.slice(0, 3);
        const rest = row.original.tags.length - visible.length;

        if (visible.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {visible.map((tag) => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))}
            {rest > 0 ? (
              <Badge
                variant="outline"
                title={row.original.tags
                  .slice(3)
                  .map((tag) => tag.name)
                  .join(", ")}
              >
                +{rest}
              </Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "stockQty",
      header: "Estoque",
      cell: ({ row }) => {
        const label = stockLabel(row.original);

        return label === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">{label}</span>
        );
      },
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
              value={q}
              onChange={(event) => {
                const next = event.target.value;

                void setFilters(
                  { q: next },
                  { limitUrlUpdates: next === "" ? undefined : debounce(300) },
                );
              }}
              placeholder="Buscar por nome, SEO, variação ou descrição…"
              aria-label="Buscar produtos"
            />
            {isPending ? (
              <InputGroupAddon align="inline-end">
                <Spinner aria-label="Carregando produtos" />
              </InputGroupAddon>
            ) : null}
          </InputGroup>

          <ToggleGroup
            variant="outline"
            aria-label="Disponibilidade"
            value={[status]}
            onValueChange={(next) => {
              const selected = next[0];

              if (selected === "all" || selected === "active" || selected === "inactive")
                void setFilters({ status: selected });
            }}
          >
            <ToggleGroupItem value="all">Todos</ToggleGroupItem>
            <ToggleGroupItem value="active">Ativos</ToggleGroupItem>
            <ToggleGroupItem value="inactive">Inativos</ToggleGroupItem>
          </ToggleGroup>

          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" />}
              aria-label={advancedFilterCount > 0 ? `Filtros (${advancedFilterCount})` : "Filtros"}
            >
              <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
              Filtros
              {advancedFilterCount > 0 ? (
                <Badge variant="secondary" className="ml-1 tabular-nums">
                  {advancedFilterCount}
                </Badge>
              ) : null}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] gap-4 p-4">
              <PopoverHeader>
                <PopoverTitle>Filtrar produtos</PopoverTitle>
                <PopoverDescription>
                  Refine a lista por categoria, departamento, visibilidade, tags e preço.
                </PopoverDescription>
              </PopoverHeader>

              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="products-category">Categoria</FieldLabel>
                  <Select
                    items={categoryOptions}
                    value={category || NO_SELECTION}
                    onValueChange={(next) =>
                      void setFilters({
                        category: next === null || next === NO_SELECTION ? null : next,
                      })
                    }
                  >
                    <SelectTrigger id="products-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {categoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="products-department">Departamento</FieldLabel>
                  <Select
                    items={departmentOptions}
                    value={department || NO_SELECTION}
                    onValueChange={(next) =>
                      void setFilters({
                        department: next === null || next === NO_SELECTION ? null : next,
                      })
                    }
                  >
                    <SelectTrigger id="products-department" className="w-full">
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
                </Field>

                <Field>
                  <FieldLabel htmlFor="products-visibility">Visibilidade</FieldLabel>
                  <Select
                    items={visibilityOptions}
                    value={visibility}
                    onValueChange={(next) => {
                      if (
                        next === "all" ||
                        next === "archived" ||
                        next === "hidden" ||
                        next === "private"
                      )
                        void setFilters({ visibility: next });
                    }}
                  >
                    <SelectTrigger id="products-visibility" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {visibilityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <FieldTitle>Tags</FieldTitle>
                    {selectedTags.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => void setFilters({ tags: null })}
                      >
                        Limpar tags
                      </Button>
                    ) : null}
                  </div>

                  {tags.length > 0 ? (
                    <>
                      <ScrollArea className="max-h-44">
                        <ToggleGroup
                          multiple
                          variant="outline"
                          size="sm"
                          className="w-full flex-wrap pr-3"
                          aria-label="Filtrar por tags"
                          value={selectedTags}
                          onValueChange={(next) =>
                            void setFilters({ tags: next.length > 0 ? next : null })
                          }
                        >
                          {visibleTags.map((tag) => (
                            <ToggleGroupItem key={tag.id} value={tag.id}>
                              {tag.name}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </ScrollArea>
                      {visibleTagCount < tags.length ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="self-start"
                          onClick={() => setVisibleTagCount((count) => count + 5)}
                        >
                          Carregar +5 tags
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma tag cadastrada.</p>
                  )}
                </div>

                <Field orientation="horizontal" className="w-auto">
                  <Checkbox
                    id="products-priced-only"
                    checked={priced}
                    onCheckedChange={(checked) => void setFilters({ priced: Boolean(checked) })}
                  />
                  <FieldLabel htmlFor="products-priced-only">Somente com preço</FieldLabel>
                </Field>

                <Field orientation="horizontal" className="w-auto">
                  <Checkbox
                    id="products-untagged-only"
                    checked={untagged}
                    onCheckedChange={(checked) => void setFilters({ untagged: Boolean(checked) })}
                  />
                  <FieldLabel htmlFor="products-untagged-only">Somente sem tags</FieldLabel>
                </Field>
              </FieldGroup>
            </PopoverContent>
          </Popover>

          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              <X data-icon="inline-start" aria-hidden="true" />
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {products.length} de {totalCount} itens
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {bulkStatus ? (
              <p role="status" className="text-xs text-muted-foreground">
                {bulkStatus}
              </p>
            ) : null}
            <ToggleGroup
              variant="outline"
              size="sm"
              aria-label="Visualização"
              value={[view]}
              onValueChange={(next) => {
                const selected = next[0];

                setView(
                  selected === "grid" || selected === "tree" || selected === "table"
                    ? selected
                    : "table",
                );
              }}
            >
              <ToggleGroupItem value="table" aria-label="Visualização em tabela" title="Tabela">
                <Rows3 aria-hidden="true" />
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Visualização em cartões" title="Cartões">
                <LayoutGrid aria-hidden="true" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="tree"
                aria-label="Visualização em árvore"
                title="Departamentos e categorias"
              >
                <FolderTree aria-hidden="true" />
              </ToggleGroupItem>
            </ToggleGroup>
            {view !== "table" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Fechar visualização"
                title="Fechar visualização"
                onClick={() => setView("table")}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        {activeSelectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <p className="mr-1 text-sm font-medium">
              {activeSelectedIds.length}{" "}
              {activeSelectedIds.length === 1 ? "selecionado" : "selecionados"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkUpdateMutation.isPending}
              onClick={() => runAvailability(true)}
            >
              <CircleCheck data-icon="inline-start" aria-hidden="true" />
              Disponibilizar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkUpdateMutation.isPending}
              onClick={() => runAvailability(false)}
            >
              <CircleSlash data-icon="inline-start" aria-hidden="true" />
              Indisponibilizar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkUpdateMutation.isPending}
              onClick={() => openBulkDialog("tags")}
            >
              <Tag data-icon="inline-start" aria-hidden="true" />
              Adicionar tags
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkUpdateMutation.isPending}
              onClick={() => openBulkDialog("category")}
            >
              <FolderInput data-icon="inline-start" aria-hidden="true" />
              Categoria
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkUpdateMutation.isPending}
              onClick={() => openBulkDialog("department")}
            >
              <FolderTree data-icon="inline-start" aria-hidden="true" />
              Departamento
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => openBulkDialog("delete")}
            >
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              Excluir
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              Limpar seleção
            </Button>
          </div>
        ) : null}

        {bulkError ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível atualizar os produtos</AlertTitle>
            <AlertDescription>{bulkError}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum produto corresponde aos filtros.
        </p>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const price = priceLabel(product);
            const stock = stockLabel(product);
            const visible = product.tags.slice(0, 3);
            const rest = product.tags.length - visible.length;

            return (
              <Card key={product.id} size="sm">
                <CardHeader>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      aria-label={`Selecionar ${product.name}`}
                      checked={selectedSet.has(product.id)}
                      onCheckedChange={(checked) => toggleRow(product.id, checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-sm">
                        <HoverPrefetchLink
                          href={`/dashboard/${storeSlug}/catalog/products/${product.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {product.name}
                        </HoverPrefetchLink>
                      </CardTitle>
                      <CardDescription className="truncate">
                        {product.categoryName ?? "Sem categoria"} ·{" "}
                        {product.departmentName ?? "Sem departamento"}
                      </CardDescription>
                    </div>
                    {availabilitySwitch(product)}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      {price ?? <span className="text-muted-foreground">Sem preço</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">Estoque: {stock ?? "—"}</span>
                  </div>
                  {visible.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {visible.map((tag) => (
                        <Badge key={tag.id} variant="outline">
                          {tag.name}
                        </Badge>
                      ))}
                      {rest > 0 ? <Badge variant="outline">+{rest}</Badge> : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : view === "tree" ? (
        <Card>
          <CardHeader>
            <CardTitle>Catálogo por departamento</CardTitle>
            <CardDescription>Departamentos → categorias → produtos.</CardDescription>
          </CardHeader>
          <CardContent>
            <FileTree
              items={treeItems}
              defaultExpanded={treeItems.map((item) => item.id)}
              showLines
              onSelectedChange={(id) => {
                if (id.startsWith("product:")) {
                  router.push(
                    `/dashboard/${storeSlug}/catalog/products/${id.slice("product:".length)}`,
                  );
                }
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable
          key={JSON.stringify([
            q,
            status,
            visibility,
            category,
            department,
            selectedTags,
            priced,
            untagged,
          ])}
          columns={columns}
          data={products}
          hideToolbar
          tableLabel="Produtos"
          rowHref={(product) => `/dashboard/${storeSlug}/catalog/products/${product.id}`}
          exportHref={exportHref}
        />
      )}

      <Dialog
        open={bulkDialog === "tags"}
        onOpenChange={(open) => {
          if (!open) setBulkDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar tags</DialogTitle>
            <DialogDescription>
              As tags escolhidas serão adicionadas aos produtos selecionados. As que já estiverem
              ligadas não são duplicadas.
            </DialogDescription>
          </DialogHeader>
          {tags.length > 0 ? (
            <TagCombobox
              id="bulk-tags"
              ariaLabel="Tags para adicionar"
              tags={tags}
              value={tagSelection}
              onChange={setTagSelection}
              placeholder="Buscar tags…"
              className="w-full"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma tag cadastrada.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={tagSelection.length === 0 || bulkUpdateMutation.isPending}
              onClick={() => bulkUpdateMutation.mutate({ addTagIds: tagSelection })}
            >
              {bulkUpdateMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Adicionar tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkDialog === "category" || bulkDialog === "department"}
        onOpenChange={(open) => {
          if (!open) setBulkDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkDialog === "category" ? "Mover para categoria" : "Mover para departamento"}
            </DialogTitle>
            <DialogDescription>
              Escolha o destino dos produtos selecionados. A opção vazia remove a categoria ou o
              departamento.
            </DialogDescription>
          </DialogHeader>
          <TaxonomyCombobox
            id="bulk-taxonomy"
            ariaLabel={
              bulkDialog === "category" ? "Categoria de destino" : "Departamento de destino"
            }
            items={bulkDialog === "category" ? categories : departments}
            value={taxonomySelection}
            onChange={setTaxonomySelection}
            emptyLabel={bulkDialog === "category" ? "Sem categoria" : "Sem departamento"}
            placeholder="Buscar…"
            className="w-full"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={bulkUpdateMutation.isPending}
              onClick={() =>
                bulkUpdateMutation.mutate(
                  bulkDialog === "category"
                    ? { categoryId: taxonomySelection }
                    : { departmentId: taxonomySelection },
                )
              }
            >
              {bulkUpdateMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={bulkDialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setBulkDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {activeSelectedIds.length}{" "}
              {activeSelectedIds.length === 1 ? "produto" : "produtos"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              As variações e as tags ligadas a eles também são removidas. Produtos que fazem parte
              de pedidos ou kits são mantidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate()}
            >
              {bulkDeleteMutation.isPending ? "Excluindo…" : "Excluir produtos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
