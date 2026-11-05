/**
 * Grupos e pratos do kit. O tipo do kit decide quais campos aparecem: `fixed`
 * pede a quantidade travada de cada prato, `custom_quantities` e `fixed_total`
 * permitem definir limites mínimo, máximo e passo por prato.
 *
 * Cada prato escolhe um produto e uma variação; a troca, quando ligada, só
 * oferece as variações marcadas aqui — o comprador nunca vê o produto inteiro.
 *
 * Suporta ordenação por arrastar e soltar (drag and drop) no desktop e botões
 * táteis dedicados de subir/descer para dispositivos móveis e acessibilidade.
 */
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FolderKanban,
  GripVertical,
  Plus,
  Trash2,
  Utensils,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { formatBrl } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { PanelKitOptionProduct } from "@/lib/api/model/panelKitOptionProduct.ts";
import type { KitErrors, KitGroupValues, KitItemValues, KitKindValue } from "../schemas/kit.ts";
import { ProductCombobox } from "./product-combobox.tsx";

/** Um grupo novo nasce sem limites: o lojista só nomeia. */
export function newGroup(): KitGroupValues {
  return { key: crypto.randomUUID(), name: "", minItems: null, maxItems: null };
}

export function newItem(groupId: string | null): KitItemValues {
  return {
    key: crypto.randomUUID(),
    productId: "",
    variationId: "",
    groupId,
    quantity: 1,
    minQty: null,
    maxQty: null,
    step: 1,
    allowSwap: false,
    swapVariationIds: [],
  };
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function ErrorText({ message }: { message?: string }) {
  return message ? <FieldError>{message}</FieldError> : null;
}

function DishRow({
  item,
  index,
  kind,
  groups,
  options,
  errors,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onPatch,
  onRemove,
}: {
  item: KitItemValues;
  index: number;
  kind: KitKindValue;
  groups: KitGroupValues[];
  options: PanelKitOptionProduct[];
  errors: KitErrors;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onPatch: (patch: Partial<KitItemValues>) => void;
  onRemove: () => void;
}) {
  const product = options.find((option) => option.id === item.productId);
  const variations = product?.variations ?? [];

  const variationOptions = variations.map((variation) => ({
    value: variation.id,
    label: `${variation.name} (${formatBrl(variation.priceCents)})`,
  }));

  const groupOptions = [
    { value: "none", label: "Sem grupo" },
    ...groups.map((group) => ({
      value: group.key,
      label: group.name.trim() === "" ? "Grupo sem nome" : group.name,
    })),
  ];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-background p-3.5 transition-all",
        isDragging && "opacity-40 border-dashed border-primary bg-muted/40",
        isDragOver && "ring-2 ring-primary ring-offset-1 border-primary",
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        {/* Barra superior no mobile / lateral no desktop com alça e ordenação */}
        <div className="flex items-center justify-between gap-2 md:justify-start">
          <div className="flex items-center gap-1.5 md:flex-col md:pt-1">
            <div
              className="flex size-7 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
              aria-label={`Arrastar prato ${index + 1}`}
              tabIndex={-1}
            >
              <GripVertical className="size-4" />
            </div>
            <div className="flex items-center gap-0.5 md:flex-col">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                aria-label={`Mover prato ${index + 1} para cima`}
              >
                <ChevronUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                aria-label={`Mover prato ${index + 1} para baixo`}
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-initial">
            {product?.imageUrl ? (
              <div className="size-11 shrink-0 overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line nextjs/no-img-element -- tenant asset, not a Next app */}
                <img src={product.imageUrl} alt="" className="size-full object-cover" />
              </div>
            ) : (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                <Utensils className="size-5" />
              </div>
            )}

            {product ? (
              <div className="min-w-0 flex-1 md:hidden">
                <p className="truncate text-sm font-medium">{product.name}</p>
                {product.categoryName ? (
                  <p className="truncate text-xs text-muted-foreground">{product.categoryName}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive md:hidden"
            aria-label={`Remover prato ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 data-icon />
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Field
              className="flex-1"
              data-invalid={errors[`items.${index}.productId`] !== undefined}
            >
              <FieldLabel>Produto</FieldLabel>
              <ProductCombobox
                options={options}
                value={item.productId}
                invalid={errors[`items.${index}.productId`] !== undefined}
                onChange={(nextId) => {
                  const nextProduct = options.find((option) => option.id === nextId);

                  onPatch({
                    productId: nextId,
                    variationId: nextProduct?.variations[0]?.id ?? "",
                    swapVariationIds: [],
                  });
                }}
              />
              <ErrorText message={errors[`items.${index}.productId`]} />
            </Field>

            <Field className="w-full sm:w-56">
              <FieldLabel>Variação padrão</FieldLabel>
              <Select
                items={variationOptions}
                value={item.variationId}
                onValueChange={(next) => {
                  if (next !== null) onPatch({ variationId: next });
                }}
              >
                <SelectTrigger aria-label={`Variação do prato ${index + 1}`}>
                  <SelectValue placeholder="Escolha a variação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {variationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {groups.length > 0 ? (
              <Field className="w-full sm:w-44">
                <FieldLabel>Grupo</FieldLabel>
                <Select
                  items={groupOptions}
                  value={item.groupId ?? "none"}
                  onValueChange={(next) => onPatch({ groupId: next === "none" ? null : next })}
                >
                  <SelectTrigger aria-label={`Grupo do prato ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {groupOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <ErrorText message={errors[`items.${index}.groupId`]} />
              </Field>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hidden self-end text-muted-foreground hover:text-destructive sm:mt-6 sm:self-auto md:inline-flex"
              aria-label={`Remover prato ${index + 1}`}
              onClick={onRemove}
            >
              <Trash2 data-icon />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            {kind === "fixed" ? (
              <Field className="w-28">
                <FieldLabel htmlFor={`item-${item.key}-quantity`}>Quantidade</FieldLabel>
                <Input
                  id={`item-${item.key}-quantity`}
                  type="number"
                  min={1}
                  value={item.quantity ?? 1}
                  aria-invalid={errors[`items.${index}.quantity`] !== undefined}
                  onChange={(event) => onPatch({ quantity: numberOrNull(event.target.value) ?? 1 })}
                />
                <ErrorText message={errors[`items.${index}.quantity`]} />
              </Field>
            ) : (
              <>
                <Field className="w-24">
                  <FieldLabel htmlFor={`item-${item.key}-min`}>Mín. prato</FieldLabel>
                  <Input
                    id={`item-${item.key}-min`}
                    type="number"
                    min={0}
                    placeholder="0"
                    value={item.minQty ?? ""}
                    aria-invalid={errors[`items.${index}.minQty`] !== undefined}
                    onChange={(event) => onPatch({ minQty: numberOrNull(event.target.value) })}
                  />
                  <ErrorText message={errors[`items.${index}.minQty`]} />
                </Field>
                <Field className="w-24">
                  <FieldLabel htmlFor={`item-${item.key}-max`}>Máx. prato</FieldLabel>
                  <Input
                    id={`item-${item.key}-max`}
                    type="number"
                    min={1}
                    placeholder="Livre"
                    value={item.maxQty ?? ""}
                    aria-invalid={errors[`items.${index}.maxQty`] !== undefined}
                    onChange={(event) => onPatch({ maxQty: numberOrNull(event.target.value) })}
                  />
                  <ErrorText message={errors[`items.${index}.maxQty`]} />
                </Field>
                <Field className="w-24">
                  <FieldLabel htmlFor={`item-${item.key}-step`}>Passo</FieldLabel>
                  <Input
                    id={`item-${item.key}-step`}
                    type="number"
                    min={1}
                    placeholder="1"
                    value={item.step}
                    aria-invalid={errors[`items.${index}.step`] !== undefined}
                    onChange={(event) => onPatch({ step: numberOrNull(event.target.value) ?? 1 })}
                  />
                  <ErrorText message={errors[`items.${index}.step`]} />
                </Field>
              </>
            )}

            <Field orientation="horizontal" className="pt-5">
              <Switch
                id={`item-${item.key}-swap`}
                checked={item.allowSwap}
                onCheckedChange={(checked) =>
                  onPatch({
                    allowSwap: checked,
                    swapVariationIds: checked ? item.swapVariationIds : [],
                  })
                }
              />
              <FieldLabel htmlFor={`item-${item.key}-swap`}>Permitir troca de variação</FieldLabel>
            </Field>
          </div>

          {item.allowSwap ? (
            <fieldset className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
              <legend className="px-1 text-xs font-medium text-foreground">
                Variações permitidas para troca
              </legend>
              {variations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Selecione um produto para carregar as variações disponíveis.
                </p>
              ) : (
                <div className="flex flex-wrap gap-4 pt-1">
                  {variations.map((variation) => {
                    const id = `swap-${item.key}-${variation.id}`;
                    const checked = item.swapVariationIds.includes(variation.id);

                    return (
                      <Field key={variation.id} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(next) =>
                            onPatch({
                              swapVariationIds: next
                                ? [...item.swapVariationIds, variation.id]
                                : item.swapVariationIds.filter((value) => value !== variation.id),
                            })
                          }
                        />
                        <FieldLabel htmlFor={id} className="text-xs">
                          {variation.name}{" "}
                          <span className="text-muted-foreground">
                            ({formatBrl(variation.priceCents)})
                          </span>
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </div>
              )}
              <ErrorText message={errors[`items.${index}.swapVariationIds`]} />
            </fieldset>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function KitItemsEditor({
  kind,
  groups,
  items,
  options,
  errors,
  onGroups,
  onItems,
}: {
  kind: KitKindValue;
  groups: KitGroupValues[];
  items: KitItemValues[];
  options: PanelKitOptionProduct[];
  errors: KitErrors;
  onGroups: (next: KitGroupValues[]) => void;
  onItems: (next: KitItemValues[]) => void;
}) {
  const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);
  const [draggedDishKey, setDraggedDishKey] = useState<string | null>(null);
  const [dragOverDishKey, setDragOverDishKey] = useState<string | null>(null);
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null);

  const patchGroup = (index: number, patch: Partial<KitGroupValues>) => {
    onGroups(groups.map((group, at) => (at === index ? { ...group, ...patch } : group)));
  };

  const patchItem = (index: number, patch: Partial<KitItemValues>) => {
    onItems(items.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  };

  const moveGroup = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= groups.length) return;
    const next = [...groups];
    const [moved] = next.splice(fromIndex, 1);

    if (moved) {
      next.splice(toIndex, 0, moved);
      onGroups(next);
    }
  };

  const moveDishInGroup = (dishKey: string, direction: "up" | "down") => {
    const targetDish = items.find((i) => i.key === dishKey);

    if (!targetDish) return;

    const siblings = items.filter((i) =>
      targetDish.groupId
        ? i.groupId === targetDish.groupId
        : !i.groupId || !groups.some((g) => g.key === i.groupId),
    );

    const sibIdx = siblings.findIndex((i) => i.key === dishKey);

    if (sibIdx === -1) return;

    const targetSibIdx = direction === "up" ? sibIdx - 1 : sibIdx + 1;

    if (targetSibIdx < 0 || targetSibIdx >= siblings.length) return;

    const swapSibling = siblings[targetSibIdx];

    if (!swapSibling) return;

    const nextItems = [...items];
    const currentIdx = nextItems.findIndex((i) => i.key === dishKey);
    nextItems.splice(currentIdx, 1);
    const insertIdx = nextItems.findIndex((i) => i.key === swapSibling.key);

    if (direction === "up") {
      nextItems.splice(insertIdx, 0, targetDish);
    } else {
      nextItems.splice(insertIdx + 1, 0, targetDish);
    }

    onItems(nextItems);
  };

  const moveDishToPosition = (dishKey: string, targetDishKey: string) => {
    if (dishKey === targetDishKey) return;
    const dish = items.find((i) => i.key === dishKey);
    const targetDish = items.find((i) => i.key === targetDishKey);

    if (!dish || !targetDish) return;

    const updatedDish = { ...dish, groupId: targetDish.groupId };
    const nextItems = items.filter((i) => i.key !== dishKey);
    const targetIdx = nextItems.findIndex((i) => i.key === targetDishKey);

    if (targetIdx !== -1) {
      nextItems.splice(targetIdx, 0, updatedDish);
    } else {
      nextItems.push(updatedDish);
    }

    onItems(nextItems);
  };

  const moveDishToGroup = (dishKey: string, targetGroupId: string | null) => {
    const dish = items.find((i) => i.key === dishKey);

    if (!dish || dish.groupId === targetGroupId) return;

    const updatedDish = { ...dish, groupId: targetGroupId };
    const nextItems = items.filter((i) => i.key !== dishKey);

    let lastInGroupIdx = -1;

    for (let at = nextItems.length - 1; at >= 0; at--) {
      const entry = nextItems[at];

      if (!entry) continue;

      const belongs = targetGroupId
        ? entry.groupId === targetGroupId
        : !entry.groupId || !groups.some((g) => g.key === entry.groupId);

      if (belongs) {
        lastInGroupIdx = at;
        break;
      }
    }

    if (lastInGroupIdx !== -1) {
      nextItems.splice(lastInGroupIdx + 1, 0, updatedDish);
    } else {
      nextItems.push(updatedDish);
    }

    onItems(nextItems);
  };

  const ungroupedItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.groupId || !groups.some((g) => g.key === item.groupId));

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group, groupIndex) => {
        const groupDishes = items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.groupId === group.key);

        const isGroupDragging = draggedGroupIndex === groupIndex;

        const isGroupDragOver =
          dragOverGroupIndex === groupIndex &&
          draggedGroupIndex !== null &&
          draggedGroupIndex !== groupIndex;

        return (
          <div
            key={group.key}
            onDragOver={(e) => {
              if (draggedGroupIndex !== null && draggedGroupIndex !== groupIndex) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverGroupIndex(groupIndex);
              } else if (draggedDishKey !== null) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverGroupKey(group.key);
              }
            }}
            onDragLeave={() => {
              if (dragOverGroupIndex === groupIndex) setDragOverGroupIndex(null);

              if (dragOverGroupKey === group.key) setDragOverGroupKey(null);
            }}
            onDrop={(e) => {
              e.preventDefault();

              if (draggedGroupIndex !== null) {
                moveGroup(draggedGroupIndex, groupIndex);
                setDraggedGroupIndex(null);
                setDragOverGroupIndex(null);
              } else if (draggedDishKey !== null) {
                moveDishToGroup(draggedDishKey, group.key);
                setDraggedDishKey(null);
                setDragOverDishKey(null);
                setDragOverGroupKey(null);
              }
            }}
            className={cn(
              "flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs transition-all",
              isGroupDragging && "opacity-40 border-dashed border-primary bg-muted/40",
              isGroupDragOver && "ring-2 ring-primary ring-offset-2 border-primary",
              dragOverGroupKey === group.key && "ring-2 ring-primary ring-offset-2 bg-primary/5",
            )}
          >
            {/* Cabeçalho unificado do grupo: sem gap excessivo no desktop */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="flex items-center gap-1.5 pt-0.5 lg:pt-6">
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "text/plain",
                      JSON.stringify({ type: "group", index: groupIndex }),
                    );
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedGroupIndex(groupIndex);
                  }}
                  onDragEnd={() => {
                    setDraggedGroupIndex(null);
                    setDragOverGroupIndex(null);
                  }}
                  className="flex size-7 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
                  aria-label={`Arrastar grupo ${group.name || groupIndex + 1}`}
                  tabIndex={-1}
                >
                  <GripVertical className="size-4" />
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={groupIndex === 0}
                    onClick={() => moveGroup(groupIndex, groupIndex - 1)}
                    aria-label={`Mover grupo ${group.name || groupIndex + 1} para cima`}
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={groupIndex === groups.length - 1}
                    onClick={() => moveGroup(groupIndex, groupIndex + 1)}
                    aria-label={`Mover grupo ${group.name || groupIndex + 1} para baixo`}
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground">
                  <FolderKanban className="size-3.5 text-primary" />
                  <span>Grupo {groupIndex + 1}</span>
                </div>
              </div>

              <Field
                className="min-w-[200px] flex-1"
                data-invalid={errors[`groups.${groupIndex}.name`] !== undefined}
              >
                <FieldLabel htmlFor={`group-${group.key}-name`}>Nome do grupo</FieldLabel>
                <Input
                  id={`group-${group.key}-name`}
                  value={group.name}
                  placeholder="Ex.: Proteínas, Acompanhamentos..."
                  aria-invalid={errors[`groups.${groupIndex}.name`] !== undefined}
                  onChange={(event) => patchGroup(groupIndex, { name: event.target.value })}
                />
                <ErrorText message={errors[`groups.${groupIndex}.name`]} />
              </Field>

              <div className="flex items-start gap-2.5">
                <Field className="w-24 sm:w-28">
                  <FieldLabel htmlFor={`group-${group.key}-min`}>Mín. itens</FieldLabel>
                  <Input
                    id={`group-${group.key}-min`}
                    type="number"
                    min={0}
                    placeholder="Sem mín"
                    value={group.minItems ?? ""}
                    aria-invalid={errors[`groups.${groupIndex}.minItems`] !== undefined}
                    onChange={(event) =>
                      patchGroup(groupIndex, { minItems: numberOrNull(event.target.value) })
                    }
                  />
                  <ErrorText message={errors[`groups.${groupIndex}.minItems`]} />
                </Field>

                <Field className="w-24 sm:w-28">
                  <FieldLabel htmlFor={`group-${group.key}-max`}>Máx. itens</FieldLabel>
                  <Input
                    id={`group-${group.key}-max`}
                    type="number"
                    min={1}
                    placeholder="Sem máx"
                    value={group.maxItems ?? ""}
                    aria-invalid={errors[`groups.${groupIndex}.maxItems`] !== undefined}
                    onChange={(event) =>
                      patchGroup(groupIndex, { maxItems: numberOrNull(event.target.value) })
                    }
                  />
                  <ErrorText message={errors[`groups.${groupIndex}.maxItems`]} />
                </Field>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="mt-6 text-muted-foreground hover:text-destructive"
                  aria-label={`Remover grupo ${group.name || groupIndex + 1}`}
                  onClick={() => {
                    onGroups(groups.filter((_, at) => at !== groupIndex));
                    onItems(
                      items.map((item) =>
                        item.groupId === group.key ? { ...item, groupId: null } : item,
                      ),
                    );
                  }}
                >
                  <Trash2 data-icon />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-1">
              {groupDishes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-5 text-center text-xs text-muted-foreground">
                  Nenhum prato adicionado a este grupo ainda. Arraste pratos aqui ou adicione
                  abaixo.
                </div>
              ) : (
                groupDishes.map(({ item, index: dishIdx }, dishIndexInGroup) => (
                  <DishRow
                    key={item.key}
                    item={item}
                    index={dishIdx}
                    kind={kind}
                    groups={groups}
                    options={options}
                    errors={errors}
                    canMoveUp={dishIndexInGroup > 0}
                    canMoveDown={dishIndexInGroup < groupDishes.length - 1}
                    onMoveUp={() => moveDishInGroup(item.key, "up")}
                    onMoveDown={() => moveDishInGroup(item.key, "down")}
                    isDragging={draggedDishKey === item.key}
                    isDragOver={dragOverDishKey === item.key}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData(
                        "text/plain",
                        JSON.stringify({ type: "dish", key: item.key }),
                      );
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedDishKey(item.key);
                    }}
                    onDragOver={(e) => {
                      if (draggedDishKey && draggedDishKey !== item.key) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverDishKey(item.key);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedDishKey(null);
                      setDragOverDishKey(null);
                      setDragOverGroupKey(null);
                    }}
                    onDrop={(e) => {
                      if (draggedDishKey && draggedDishKey !== item.key) {
                        e.preventDefault();
                        e.stopPropagation();
                        moveDishToPosition(draggedDishKey, item.key);
                        setDraggedDishKey(null);
                        setDragOverDishKey(null);
                        setDragOverGroupKey(null);
                      }
                    }}
                    onPatch={(patch) => patchItem(dishIdx, patch)}
                    onRemove={() => onItems(items.filter((_, at) => at !== dishIdx))}
                  />
                ))
              )}
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onItems([...items, newItem(group.key)])}
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Adicionar prato neste grupo
              </Button>
            </div>
          </div>
        );
      })}

      {(ungroupedItems.length > 0 || groups.length === 0) && (
        <div
          onDragOver={(e) => {
            if (draggedDishKey) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverGroupKey("ungrouped");
            }
          }}
          onDragLeave={() => {
            if (dragOverGroupKey === "ungrouped") setDragOverGroupKey(null);
          }}
          onDrop={(e) => {
            if (draggedDishKey) {
              e.preventDefault();
              moveDishToGroup(draggedDishKey, null);
              setDraggedDishKey(null);
              setDragOverDishKey(null);
              setDragOverGroupKey(null);
            }
          }}
          className={cn(
            "flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs transition-all",
            dragOverGroupKey === "ungrouped" && "ring-2 ring-primary ring-offset-2 bg-primary/5",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Utensils className="size-4.5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                {groups.length === 0 ? "Pratos do kit" : "Pratos sem grupo"}
              </h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onItems([...items, newItem(null)])}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              Adicionar prato
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {ungroupedItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-5 text-center text-xs text-muted-foreground">
                Nenhum prato sem grupo.
              </div>
            ) : (
              ungroupedItems.map(({ item, index: dishIdx }, dishIndexInUngrouped) => (
                <DishRow
                  key={item.key}
                  item={item}
                  index={dishIdx}
                  kind={kind}
                  groups={groups}
                  options={options}
                  errors={errors}
                  canMoveUp={dishIndexInUngrouped > 0}
                  canMoveDown={dishIndexInUngrouped < ungroupedItems.length - 1}
                  onMoveUp={() => moveDishInGroup(item.key, "up")}
                  onMoveDown={() => moveDishInGroup(item.key, "down")}
                  isDragging={draggedDishKey === item.key}
                  isDragOver={dragOverDishKey === item.key}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData(
                      "text/plain",
                      JSON.stringify({ type: "dish", key: item.key }),
                    );
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedDishKey(item.key);
                  }}
                  onDragOver={(e) => {
                    if (draggedDishKey && draggedDishKey !== item.key) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverDishKey(item.key);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedDishKey(null);
                    setDragOverDishKey(null);
                    setDragOverGroupKey(null);
                  }}
                  onDrop={(e) => {
                    if (draggedDishKey && draggedDishKey !== item.key) {
                      e.preventDefault();
                      e.stopPropagation();
                      moveDishToPosition(draggedDishKey, item.key);
                      setDraggedDishKey(null);
                      setDragOverDishKey(null);
                      setDragOverGroupKey(null);
                    }
                  }}
                  onPatch={(patch) => patchItem(dishIdx, patch)}
                  onRemove={() => onItems(items.filter((_, at) => at !== dishIdx))}
                />
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-border p-4">
        <div>
          <p className="text-sm font-medium">Grupos e seções</p>
          <p className="text-xs text-muted-foreground">
            Deseja dividir o kit em seções como proteínas e acompanhamentos?
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onGroups([...groups, newGroup()])}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Adicionar grupo
        </Button>
      </div>
    </div>
  );
}
