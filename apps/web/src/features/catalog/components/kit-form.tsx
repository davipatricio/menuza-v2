/**
 * Editor de kit. Três abas: identidade, composição (inclui tipo e regras de montagem)
 * e preço. O tipo do kit esconde os campos que não se aplicam, e a prévia usa a
 * mesma função de preço do checkout.
 *
 * O submit valida com `validateKit()` antes de sair; o servidor repete as
 * mesmas regras, então uma divergência aparece como erro de API, nunca como
 * payload inválido salvo.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { formatBrlInput } from "@/lib/format.ts";
import {
  KIT_KIND_LABELS,
  KIT_PRICING_MODE_LABELS,
  KIT_UNAVAILABLE_BEHAVIOR_LABELS,
} from "@/lib/panel-labels.ts";
import type { PanelKitDetail } from "@/lib/api/model/panelKitDetail.ts";
import type { PanelKitOptionProduct } from "@/lib/api/model/panelKitOptionProduct.ts";
import {
  createKitFn,
  updateKitFn,
  type KitMutationFailure,
} from "../server/kit-mutations.functions.ts";
import {
  KIT_KINDS,
  KIT_PRICING_MODES,
  KIT_UNAVAILABLE_BEHAVIORS,
  emptyKit,
  kitPayload,
  slugify,
  validateKit,
  type KitErrors,
  type KitFormValues,
} from "../schemas/kit.ts";
import { KitItemsEditor } from "./kit-items-editor.tsx";
import { KitPreview } from "./kit-preview.tsx";

const TABS = ["dados", "composicao", "preco"] as const;

const GENERIC_CREATE_ERROR = "Não foi possível criar o kit. Tente novamente.";

const GENERIC_SAVE_ERROR = "Não foi possível salvar o kit. Tente novamente.";

/** Qual aba mostra o primeiro erro, para o submit pousar onde o problema está. */
function tabOfError(path: string): (typeof TABS)[number] {
  if (
    path.startsWith("groups.") ||
    path.startsWith("items.") ||
    path === "form" ||
    path === "minItems" ||
    path === "maxItems" ||
    path === "maxKitsPerOrder" ||
    path === "kind"
  )
    return "composicao";

  if (path.startsWith("bands.") || path === "baseCents" || path === "percentOff") return "preco";

  return "dados";
}

function valuesFromDetail(kit: PanelKitDetail): KitFormValues {
  return {
    name: kit.name,
    slug: kit.slug,
    description: kit.description ?? "",
    imageUrl: kit.imageUrl,
    kind: kit.kind,
    pricingMode: kit.pricingMode,
    baseCents: kit.baseCents,
    percentOff: kit.percentOff,
    minItems: kit.minItems,
    maxItems: kit.maxItems,
    maxKitsPerOrder: kit.maxKitsPerOrder,
    unavailableBehavior: kit.unavailableBehavior,
    couponStackable: kit.couponStackable,
    available: kit.available,
    archived: kit.archived,
    sortOrder: kit.sortOrder,
    groups: kit.groups.map((group) => ({
      key: group.id,
      name: group.name,
      minItems: group.minItems,
      maxItems: group.maxItems,
    })),
    items: kit.items.map((item) => ({
      key: item.id,
      productId: item.productId,
      variationId: item.variationId,
      groupId: item.groupId,
      quantity: item.quantity,
      minQty: item.minQty,
      maxQty: item.maxQty,
      step: item.step ?? 1,
      allowSwap: item.allowSwap,
      swapVariationIds: item.swapVariationIds,
    })),
    bands: kit.bands.map((band) => ({ minQuantity: band.minQuantity, percent: band.percent })),
  };
}

function serverMessage(failure: KitMutationFailure, fallback: string): string {
  if (failure.status === "error") {
    if (failure.code === "CONFLICT") return "Já existe um kit com este endereço nesta loja.";

    if (failure.code === "FORBIDDEN") return "Você não tem permissão para editar o catálogo.";

    if (failure.code === "NOT_FOUND") return "Kit não encontrado nesta loja.";

    if (failure.code === "VALIDATION_FAILED" || failure.code === "INVALID_INPUT")
      return "Revise os campos destacados e tente novamente.";
  }

  return fallback;
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function MoneyField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  error?: string;
  onChange: (cents: number) => void;
}) {
  return (
    <Field data-invalid={error !== undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="max-w-[14rem]">
        <InputGroupAddon align="inline-start">R$</InputGroupAddon>
        <InputGroupInput
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={formatBrlInput(value)}
          aria-invalid={error !== undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 12);

            onChange(digits === "" ? 0 : Number(digits));
          }}
        />
      </InputGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function KitForm({
  storeSlug,
  options,
  kit,
}: {
  storeSlug: string;
  options: PanelKitOptionProduct[];
  kit?: PanelKitDetail;
}) {
  const router = useRouter();
  const navigate = useNavigate();

  const [values, setValues] = useState<KitFormValues>(() =>
    kit ? valuesFromDetail(kit) : emptyKit(),
  );

  const [slugTouched, setSlugTouched] = useState(kit !== undefined);
  const [errors, setErrors] = useState<KitErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS)
      .withDefault("dados")
      .withOptions({ history: "replace", scroll: false }),
  );

  const set = (patch: Partial<KitFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const errorCount = useMemo(() => Object.keys(errors).length, [errors]);

  const mutation = useMutation({
    mutationFn: async (next: KitFormValues) => {
      const payload = kitPayload(next);

      if (kit) return updateKitFn({ data: { ...payload, storeSlug, kitId: kit.id } });

      return createKitFn({ data: { ...payload, storeSlug } });
    },
    onSuccess: (result) => {
      if (result.status !== "ok") {
        setStatus(null);
        setServerError(serverMessage(result, kit ? GENERIC_SAVE_ERROR : GENERIC_CREATE_ERROR));

        return;
      }

      if (kit) {
        setServerError(null);
        setStatus("Alterações salvas.");
        void router.invalidate();

        return;
      }

      void navigate({ href: `/dashboard/${storeSlug}/catalog/kits/${result.data.id}?created=1` });
    },
  });

  const submit = () => {
    const found = validateKit(values);

    setErrors(found);
    setServerError(null);
    setStatus(null);

    const first = Object.keys(found)[0];

    if (first !== undefined) {
      void setTab(tabOfError(first));

      return;
    }

    void mutation.mutateAsync(values);
  };

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (next === "dados" || next === "composicao" || next === "preco") void setTab(next);
        }}
      >
        <div className="-mt-1 -mb-2 w-full [scrollbar-width:none] overflow-x-auto overflow-y-hidden pt-1 pb-2 [&::-webkit-scrollbar]:hidden">
          <TabsList aria-label="Seções do kit">
            <TabsTrigger value="dados">Identidade</TabsTrigger>
            <TabsTrigger value="composicao">Composição & Regras</TabsTrigger>
            <TabsTrigger value="preco">Preço</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dados" keepMounted>
          <Card>
            <CardHeader>
              <CardTitle>Identidade</CardTitle>
              <CardDescription>Como o kit aparece na loja.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field data-invalid={errors.name !== undefined}>
                <FieldLabel htmlFor="kit-name">Nome</FieldLabel>
                <Input
                  id="kit-name"
                  value={values.name}
                  aria-invalid={errors.name !== undefined}
                  onChange={(event) => {
                    const name = event.target.value;

                    set(slugTouched ? { name } : { name, slug: slugify(name) });
                  }}
                />
                {errors.name ? <FieldError>{errors.name}</FieldError> : null}
              </Field>

              <Field data-invalid={errors.slug !== undefined}>
                <FieldLabel htmlFor="kit-slug">Endereço na loja</FieldLabel>
                <Input
                  id="kit-slug"
                  value={values.slug}
                  aria-invalid={errors.slug !== undefined}
                  onChange={(event) => {
                    setSlugTouched(true);
                    set({ slug: slugify(event.target.value) });
                  }}
                />
                <FieldDescription>
                  O kit fica em <code>/menu/kit/{values.slug || "…"}</code>.
                </FieldDescription>
                {errors.slug ? <FieldError>{errors.slug}</FieldError> : null}
              </Field>

              <Field data-invalid={errors.imageUrl !== undefined}>
                <FieldLabel htmlFor="kit-image">URL da foto</FieldLabel>
                <Input
                  id="kit-image"
                  value={values.imageUrl}
                  placeholder="https://…"
                  aria-invalid={errors.imageUrl !== undefined}
                  onChange={(event) => set({ imageUrl: event.target.value })}
                />
                {errors.imageUrl ? <FieldError>{errors.imageUrl}</FieldError> : null}
              </Field>

              <Field data-invalid={errors.description !== undefined}>
                <FieldLabel htmlFor="kit-description">Descrição</FieldLabel>
                <Textarea
                  id="kit-description"
                  rows={4}
                  value={values.description}
                  aria-invalid={errors.description !== undefined}
                  onChange={(event) => set({ description: event.target.value })}
                />
                {errors.description ? <FieldError>{errors.description}</FieldError> : null}
              </Field>

              <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                <Field orientation="horizontal" className="w-auto">
                  <Switch
                    id="kit-available"
                    checked={values.available}
                    onCheckedChange={(checked) => set({ available: checked })}
                  />
                  <FieldLabel htmlFor="kit-available">Disponível na loja</FieldLabel>
                </Field>
                <Field orientation="horizontal" className="w-auto">
                  <Switch
                    id="kit-archived"
                    checked={values.archived}
                    onCheckedChange={(checked) => set({ archived: checked })}
                  />
                  <FieldLabel htmlFor="kit-archived">Arquivado</FieldLabel>
                </Field>
                <Field className="w-28">
                  <FieldLabel htmlFor="kit-sort">Ordem</FieldLabel>
                  <Input
                    id="kit-sort"
                    type="number"
                    min={0}
                    value={values.sortOrder}
                    onChange={(event) => set({ sortOrder: numberOrNull(event.target.value) ?? 0 })}
                  />
                  {errors.sortOrder ? <FieldError>{errors.sortOrder}</FieldError> : null}
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="composicao" keepMounted className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Regras de Montagem & Tipo do Kit</CardTitle>
              <CardDescription>
                Define como o comprador interage e monta este kit no cardápio.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Tipo do Kit</FieldLabel>
                <Select
                  items={KIT_KINDS.map((kind) => ({ value: kind, label: KIT_KIND_LABELS[kind] }))}
                  value={values.kind}
                  onValueChange={(next) => {
                    if (next === "fixed" || next === "custom_quantities" || next === "fixed_total")
                      set({ kind: next });
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[22rem]" aria-label="Tipo de kit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {KIT_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {KIT_KIND_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {values.kind === "fixed"
                    ? "Cada prato tem uma quantidade travada e pré-selecionada."
                    : values.kind === "custom_quantities"
                      ? "O comprador escolhe a quantidade de cada prato dentro dos limites estipulados."
                      : "O total de itens do kit é travado (ex: 10 pratos) e o comprador distribui entre as opções."}
                </FieldDescription>
              </Field>

              <div className="flex flex-wrap gap-4">
                {values.kind !== "fixed" ? (
                  <>
                    <Field className="w-32" data-invalid={errors.minItems !== undefined}>
                      <FieldLabel htmlFor="kit-min-items">
                        {values.kind === "fixed_total" ? "Total de itens (mín)" : "Mínimo de itens"}
                      </FieldLabel>
                      <Input
                        id="kit-min-items"
                        type="number"
                        min={0}
                        placeholder={values.kind === "fixed_total" ? "Obrigatório" : "Sem mín"}
                        value={values.minItems ?? ""}
                        aria-invalid={errors.minItems !== undefined}
                        onChange={(event) => set({ minItems: numberOrNull(event.target.value) })}
                      />
                      {errors.minItems ? <FieldError>{errors.minItems}</FieldError> : null}
                    </Field>
                    <Field className="w-32" data-invalid={errors.maxItems !== undefined}>
                      <FieldLabel htmlFor="kit-max-items">
                        {values.kind === "fixed_total" ? "Total de itens (máx)" : "Máximo de itens"}
                      </FieldLabel>
                      <Input
                        id="kit-max-items"
                        type="number"
                        min={1}
                        placeholder={values.kind === "fixed_total" ? "Obrigatório" : "Sem máx"}
                        value={values.maxItems ?? ""}
                        aria-invalid={errors.maxItems !== undefined}
                        onChange={(event) => set({ maxItems: numberOrNull(event.target.value) })}
                      />
                      {errors.maxItems ? <FieldError>{errors.maxItems}</FieldError> : null}
                    </Field>
                  </>
                ) : null}

                <Field className="w-40" data-invalid={errors.maxKitsPerOrder !== undefined}>
                  <FieldLabel htmlFor="kit-max-kits">Kits por pedido</FieldLabel>
                  <Input
                    id="kit-max-kits"
                    type="number"
                    min={1}
                    placeholder="Ilimitado"
                    value={values.maxKitsPerOrder ?? ""}
                    aria-invalid={errors.maxKitsPerOrder !== undefined}
                    onChange={(event) => set({ maxKitsPerOrder: numberOrNull(event.target.value) })}
                  />
                  <FieldDescription>Vazio: sem limite.</FieldDescription>
                  {errors.maxKitsPerOrder ? (
                    <FieldError>{errors.maxKitsPerOrder}</FieldError>
                  ) : null}
                </Field>
              </div>

              <Field>
                <FieldLabel>Quando o kit fica inalcançável</FieldLabel>
                <Select
                  items={KIT_UNAVAILABLE_BEHAVIORS.map((behavior) => ({
                    value: behavior,
                    label: KIT_UNAVAILABLE_BEHAVIOR_LABELS[behavior],
                  }))}
                  value={values.unavailableBehavior}
                  onValueChange={(next) => {
                    if (next === "hide" || next === "block") set({ unavailableBehavior: next });
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-[22rem]"
                    aria-label="Comportamento quando indisponível"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {KIT_UNAVAILABLE_BEHAVIORS.map((behavior) => (
                        <SelectItem key={behavior} value={behavior}>
                          {KIT_UNAVAILABLE_BEHAVIOR_LABELS[behavior]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Um prato esgotado nunca some sozinho: ele fica visível e bloqueado.
                </FieldDescription>
              </Field>

              <Field orientation="horizontal" className="w-auto">
                <Switch
                  id="kit-coupon"
                  checked={values.couponStackable}
                  onCheckedChange={(checked) => set({ couponStackable: checked })}
                />
                <FieldLabel htmlFor="kit-coupon">
                  Permitir aplicar cupons de desconto sobre este kit
                </FieldLabel>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Grupos & Pratos</CardTitle>
              <CardDescription>
                {KIT_KIND_LABELS[values.kind]}: os pratos e os grupos que o comprador combina.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errors.form ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>Composição incompleta</AlertTitle>
                  <AlertDescription>{errors.form}</AlertDescription>
                </Alert>
              ) : null}
              <KitItemsEditor
                kind={values.kind}
                groups={values.groups}
                items={values.items}
                options={options}
                errors={errors}
                onGroups={(groups) => set({ groups })}
                onItems={(items) => set({ items })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preco" keepMounted>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Preço</CardTitle>
                <CardDescription>
                  O percentual incide depois do piso; a faixa progressiva, por último.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field>
                  <FieldLabel>Modo de preço</FieldLabel>
                  <Select
                    items={KIT_PRICING_MODES.map((mode) => ({
                      value: mode,
                      label: KIT_PRICING_MODE_LABELS[mode],
                    }))}
                    value={values.pricingMode}
                    onValueChange={(next) => {
                      if (next === "fixed" || next === "sum") set({ pricingMode: next });
                    }}
                  >
                    <SelectTrigger className="w-[16rem]" aria-label="Modo de preço">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {KIT_PRICING_MODES.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {KIT_PRICING_MODE_LABELS[mode]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {values.pricingMode === "fixed"
                      ? "O preço do kit é o valor abaixo, e os pratos não somam."
                      : "Vale a soma dos pratos escolhidos, mas nunca abaixo do valor abaixo."}
                  </FieldDescription>
                </Field>

                <MoneyField
                  id="kit-base"
                  label={values.pricingMode === "fixed" ? "Preço do kit" : "Piso de preço"}
                  value={values.baseCents}
                  error={errors.baseCents}
                  onChange={(baseCents) => set({ baseCents })}
                />

                <Field data-invalid={errors.percentOff !== undefined} className="max-w-[14rem]">
                  <FieldLabel htmlFor="kit-percent">Desconto do kit</FieldLabel>
                  <InputGroup className="max-w-[14rem]">
                    <InputGroupInput
                      id="kit-percent"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="0"
                      value={values.percentOff ?? ""}
                      aria-invalid={errors.percentOff !== undefined}
                      onChange={(event) => set({ percentOff: numberOrNull(event.target.value) })}
                    />
                    <InputGroupAddon align="inline-end">%</InputGroupAddon>
                  </InputGroup>
                  {errors.percentOff ? <FieldError>{errors.percentOff}</FieldError> : null}
                </Field>

                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <h4 className="text-sm font-semibold">Faixas progressivas</h4>
                      <p className="text-xs text-muted-foreground">
                        Não são cumulativas: vale a maior faixa alcançada pela quantidade de kits.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        set({ bands: [...values.bands, { minQuantity: 2, percent: 5 }] })
                      }
                    >
                      Adicionar faixa
                    </Button>
                  </div>

                  {values.bands.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma faixa.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {values.bands.map((band, index) => (
                        <li key={index} className="flex flex-wrap items-end gap-3">
                          <Field className="w-28">
                            <FieldLabel htmlFor={`band-${index}-min`}>A partir de</FieldLabel>
                            <Input
                              id={`band-${index}-min`}
                              type="number"
                              min={2}
                              value={band.minQuantity}
                              aria-invalid={errors[`bands.${index}.minQuantity`] !== undefined}
                              onChange={(event) =>
                                set({
                                  bands: values.bands.map((entry, at) =>
                                    at === index
                                      ? {
                                          ...entry,
                                          minQuantity: numberOrNull(event.target.value) ?? 2,
                                        }
                                      : entry,
                                  ),
                                })
                              }
                            />
                            {errors[`bands.${index}.minQuantity`] ? (
                              <FieldError>{errors[`bands.${index}.minQuantity`]}</FieldError>
                            ) : null}
                          </Field>
                          <Field className="w-32">
                            <FieldLabel htmlFor={`band-${index}-percent`}>Desconto</FieldLabel>
                            <InputGroup className="w-32">
                              <InputGroupInput
                                id={`band-${index}-percent`}
                                type="number"
                                min={1}
                                max={100}
                                value={band.percent}
                                aria-invalid={errors[`bands.${index}.percent`] !== undefined}
                                onChange={(event) =>
                                  set({
                                    bands: values.bands.map((entry, at) =>
                                      at === index
                                        ? {
                                            ...entry,
                                            percent: numberOrNull(event.target.value) ?? 1,
                                          }
                                        : entry,
                                    ),
                                  })
                                }
                              />
                              <InputGroupAddon align="inline-end">%</InputGroupAddon>
                            </InputGroup>
                            {errors[`bands.${index}.percent`] ? (
                              <FieldError>{errors[`bands.${index}.percent`]}</FieldError>
                            ) : null}
                          </Field>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              set({ bands: values.bands.filter((_, at) => at !== index) })
                            }
                          >
                            Remover
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            <KitPreview values={values} options={options} />
          </div>
        </TabsContent>
      </Tabs>

      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>
            {kit ? "Não foi possível salvar o kit" : "Não foi possível criar o kit"}
          </AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      {status ? (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      ) : null}

      {errorCount > 0 ? (
        <p role="status" className="text-sm text-destructive">
          {errorCount === 1
            ? "1 campo precisa de atenção."
            : `${errorCount} campos precisam de atenção.`}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void navigate({ href: `/dashboard/${storeSlug}/catalog/kits` })}
        >
          Cancelar
        </Button>
        <Button type="button" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          {kit ? "Salvar alterações" : "Criar kit"}
        </Button>
      </div>
    </div>
  );
}
