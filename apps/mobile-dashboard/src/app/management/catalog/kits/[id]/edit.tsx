import type { KitKind, PanelKitDetail, UpdateKitInput } from "@menuza/api-client/model";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ChipGroup, FormScreen, SwitchRow, TextField } from "@/components/form.tsx";
import { EmptyState, Loading } from "@/components/screen.tsx";
import { usePanelKit, useUpdatePanelKit } from "@/lib/catalog.ts";
import { KIT_KIND_OPTIONS } from "@/lib/labels.ts";
import { brlInput, parseBrlInput } from "@/lib/money.ts";
import { useUnsavedChangesGuard } from "@/lib/navigation.ts";
import { useSession } from "@/lib/session.tsx";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PRICE_INVALID = "Use apenas números no formato pt-BR (ex.: 49,90).";

const SLUG_INVALID = "Use letras minúsculas sem acento, números e hífens (ex.: kit-familia).";

const PERCENT_INVALID = "Use um número inteiro de 0 a 100.";

/** The API's slug alphabet: lowercase ascii, digits and single hyphens. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * The kit identity and its price. Composition — groups, dishes and bands —
 * stays on the web panel: a kit cannot be created without them, so this screen
 * edits the kits that already exist.
 */
export default function EditKitRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useSession();
  const query = usePanelKit(storeSlug, id);

  if (query.isPending) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: "Editar kit" }} />
        <Loading />
      </View>
    );
  }

  if (query.isError || !query.data) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: "Editar kit" }} />
        <EmptyState title="Kit indisponível" message="Não foi possível carregar este kit." />
      </View>
    );
  }

  return <KitEditor kit={query.data} storeSlug={storeSlug} />;
}

function KitEditor({ kit, storeSlug }: { kit: PanelKitDetail; storeSlug: string | null }) {
  const router = useRouter();
  const update = useUpdatePanelKit(storeSlug);

  const [name, setName] = useState(kit.name);
  const [slug, setSlug] = useState(kit.slug);
  const [kind, setKind] = useState<KitKind>(kit.kind);
  const [price, setPrice] = useState(brlInput(kit.baseCents));

  const [percentOff, setPercentOff] = useState(
    kit.percentOff === null ? "" : String(kit.percentOff),
  );

  const [available, setAvailable] = useState(kit.available);
  const [archived, setArchived] = useState(kit.archived);
  const [problem, setProblem] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const saved = update.isSuccess;

  useUnsavedChangesGuard(dirty && !saved);

  useEffect(() => {
    if (saved) router.back();
  }, [saved, router]);

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
      setProblem("Informe o nome do kit.");

      return;
    }

    const typedSlug = slug.trim() === "" ? slugify(trimmedName) : slug.trim().toLowerCase();

    if (typedSlug.length > 80 || !SLUG.test(typedSlug)) {
      setProblem(SLUG_INVALID);

      return;
    }

    const parsed = parseBrlInput(price);

    if (!parsed.ok) {
      setProblem(PRICE_INVALID);

      return;
    }

    if (parsed.cents === null) {
      setProblem("Informe o preço base do kit.");

      return;
    }

    const percent = percentOff.trim() === "" ? null : Number(percentOff.trim());

    if (percent !== null && (!Number.isInteger(percent) || percent < 0 || percent > 100)) {
      setProblem(PERCENT_INVALID);

      return;
    }

    // A fixed_total kit is priced by its item bounds, which live on the web panel.
    if (kind === "fixed_total" && (kit.minItems === null || kit.maxItems === null)) {
      setProblem(
        "Um kit de valor fixo precisa de limites de itens. Defina-os no painel da web antes de mudar o tipo.",
      );

      return;
    }

    const input: UpdateKitInput = {
      name: trimmedName,
      slug: typedSlug,
      kind,
      baseCents: parsed.cents,
      percentOff: percent,
      available,
      archived,
      // The nullable-clearing fields below have to carry their stored value:
      // `null` clears them, an omitted key would be the only way to keep them.
      description: kit.description,
      minItems: kit.minItems,
      maxItems: kit.maxItems,
      maxKitsPerOrder: kit.maxKitsPerOrder,
      imageUrl: null,
      couponStackable: null,
      sortOrder: null,
      unavailableBehavior: null,
      groups: null,
      items: null,
      bands: null,
    };

    update.mutate({ id: kit.id, input });
  }

  return (
    <FormScreen
      error={problem ?? update.error?.message ?? null}
      onSave={submit}
      saved={saved}
      saveLabel="Salvar kit"
      saving={update.isPending}
      title="Editar kit"
    >
      <TextField label="Nome" maxLength={120} onChangeText={change(setName)} value={name} />

      <TextField
        autoCapitalize="none"
        autoCorrect={false}
        hint="Endereço do kit na vitrine. Vazio = gerado a partir do nome."
        label="Slug"
        maxLength={80}
        onChangeText={change(setSlug)}
        placeholder={slugify(name)}
        value={slug}
      />

      <ChipGroup label="Tipo" onChange={change(setKind)} options={KIT_KIND_OPTIONS} value={kind} />

      <TextField
        hint="Em reais, ex.: 49,90."
        keyboardType="decimal-pad"
        label="Preço base"
        onChangeText={change(setPrice)}
        placeholder="0,00"
        value={price}
      />

      <TextField
        hint="Opcional. Desconto aplicado sobre o preço base, de 0 a 100."
        keyboardType="numeric"
        label="Desconto (%)"
        onChangeText={change(setPercentOff)}
        placeholder="Sem desconto"
        value={percentOff}
      />

      <SwitchRow
        description="Some da vitrine enquanto estiver desmarcado."
        label="Disponível"
        onValueChange={change(setAvailable)}
        value={available}
      />
      <SwitchRow
        description="Fora de todos os fluxos sem apagar o cadastro."
        label="Arquivado"
        onValueChange={change(setArchived)}
        value={archived}
      />

      <Text className="text-xs text-muted-foreground">
        Grupos, pratos e faixas de desconto por quantidade são editados no painel da web.
      </Text>
    </FormScreen>
  );
}
