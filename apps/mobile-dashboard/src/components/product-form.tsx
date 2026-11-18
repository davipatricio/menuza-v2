import type { PanelBadge, PanelProductDetail, PanelSubcategory } from "@menuza/api-client/model";
import { useState } from "react";
import { Text, View } from "react-native";

import { ChipGroup, ChipMultiGroup, FormScreen, SwitchRow, TextField } from "@/components/form.tsx";
import { brlInput, parseBrlInput } from "@/lib/money.ts";
import { useUnsavedChangesGuard } from "@/lib/navigation.ts";

/** What the editor collects; each route turns it into its own create or update input. */
export interface ProductFormValues {
  name: string;
  description: string;
  /** `null` when the price is not editable here or the field is empty. */
  priceCents: number | null;
  available: boolean;
  hidden: boolean;
  private: boolean;
  archived: boolean;
  subcategoryId: string | null;
  badgeIds: string[];
}

const PRICE_INVALID = "Use apenas números no formato pt-BR (ex.: 15,50).";

/**
 * The catalog product editor, shared by create and edit.
 *
 * The product stores one subcategory, so the taxonomy chip group is the
 * subcategory list labelled with its category — the same single choice the web
 * editor offers. The price lives on the product's variation; while the row has
 * at most one variation this screen carries it, and a multi-variation product
 * keeps its range and points to the web panel instead.
 */
export function ProductForm({
  product,
  subcategories,
  badges,
  error,
  saving,
  saved,
  onSubmit,
}: {
  product?: PanelProductDetail;
  subcategories: readonly PanelSubcategory[];
  badges: readonly PanelBadge[];
  error: string | null;
  saving: boolean;
  saved: boolean;
  onSubmit: (draft: ProductFormValues) => void;
}) {
  const priceEditable = !product || product.variations.length <= 1;

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(brlInput(product?.priceCents ?? null));
  const [available, setAvailable] = useState(product?.available ?? true);
  const [hidden, setHidden] = useState(product?.hidden ?? false);
  const [isPrivate, setIsPrivate] = useState(product?.private ?? false);
  const [archived, setArchived] = useState(product?.archived ?? false);
  const [subcategoryId, setSubcategoryId] = useState(product?.subcategoryId ?? "");

  const [badgeIds, setBadgeIds] = useState<string[]>(
    product?.badges.map((badge) => badge.id) ?? [],
  );

  const [problem, setProblem] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesGuard(dirty && !saved);

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }

  function submit() {
    setProblem(null);

    const trimmedName = name.trim();

    if (trimmedName === "") {
      setProblem("Informe o nome do produto.");

      return;
    }

    const parsed = parseBrlInput(price);

    if (!parsed.ok) {
      setProblem(PRICE_INVALID);

      return;
    }

    if (priceEditable && parsed.cents === null) {
      setProblem("Informe o preço do produto.");

      return;
    }

    onSubmit({
      name: trimmedName,
      description: description.trim(),
      priceCents: priceEditable ? parsed.cents : null,
      available,
      hidden,
      private: isPrivate,
      archived,
      subcategoryId: subcategoryId === "" ? null : subcategoryId,
      badgeIds,
    });
  }

  const categoryOptions = [
    { value: "", label: "Sem categoria" },
    ...[...subcategories]
      .sort((left, right) => left.categoryName.localeCompare(right.categoryName, "pt-BR"))
      .map((subcategory) => ({
        value: subcategory.id,
        label: `${subcategory.categoryName} · ${subcategory.name}`,
      })),
  ];

  const badgeOptions = [...badges]
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
    .map((badge) => ({ value: badge.id, label: badge.name }));

  return (
    <FormScreen
      error={problem ?? error}
      onSave={submit}
      saved={saved}
      saveLabel={product ? "Salvar produto" : "Criar produto"}
      saving={saving}
      title={product ? "Editar produto" : "Novo produto"}
    >
      <TextField
        label="Nome"
        maxLength={120}
        onChangeText={change(setName)}
        placeholder="Ex.: Pão de queijo"
        value={name}
      />

      <TextField
        hint="Opcional. Aparece na vitrine abaixo do nome."
        label="Descrição"
        maxLength={2000}
        multiline
        onChangeText={change(setDescription)}
        value={description}
      />

      {priceEditable ? (
        <TextField
          hint="Em reais, ex.: 15,50."
          keyboardType="decimal-pad"
          label="Preço"
          onChangeText={change(setPrice)}
          placeholder="0,00"
          value={price}
        />
      ) : (
        <View className="gap-1 rounded-xl border border-border bg-card p-4">
          <Text className="text-sm font-medium text-card-foreground">Preço</Text>
          <Text className="text-sm text-muted-foreground">
            Este produto tem {String(product?.variations.length ?? 0)} variações, cada uma com seu
            preço. Edite os valores no painel da web.
          </Text>
        </View>
      )}

      <ChipGroup
        label="Categoria"
        onChange={change(setSubcategoryId)}
        options={categoryOptions}
        value={subcategoryId}
      />

      {badgeOptions.length === 0 ? null : (
        <ChipMultiGroup
          label="Etiquetas"
          onChange={change(setBadgeIds)}
          options={badgeOptions}
          values={badgeIds}
        />
      )}

      <SwitchRow
        description="Some da vitrine enquanto estiver desmarcado."
        label="Disponível"
        onValueChange={change(setAvailable)}
        value={available}
      />
      <SwitchRow
        description="Sai da vitrine e da busca, mas continua no painel."
        label="Oculto"
        onValueChange={change(setHidden)}
        value={hidden}
      />
      <SwitchRow
        description="Só aparece para quem tem o link direto."
        label="Privado"
        onValueChange={change(setIsPrivate)}
        value={isPrivate}
      />
      <SwitchRow
        description="Fora de todos os fluxos sem apagar o cadastro."
        label="Arquivado"
        onValueChange={change(setArchived)}
        value={archived}
      />
    </FormScreen>
  );
}
