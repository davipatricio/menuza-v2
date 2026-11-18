import type {
  PanelTheme,
  SaveStoreSeoInput,
  SaveThemeInput,
  StoreSeoOutput,
  StoreSeoSettings,
} from "@menuza/api-client/model";
import {
  getPanelStoreSeo,
  getPanelStoreTheme,
  savePanelStoreSeo,
  savePanelStoreTheme,
} from "@menuza/api-client/tenant";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, Loading } from "@/components/screen.tsx";
import { useSession } from "@/lib/session.tsx";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const THEME_ERROR = "Não foi possível salvar as cores da loja. Tente novamente.";

const SEO_ERROR = "Não foi possível salvar o SEO da loja. Tente novamente.";

/**
 * WCAG relative luminance, mirroring `crates/domain/src/theme.rs` and the web
 * form. The API derives the ink on every read and refuses to store it, so the
 * preview has to pick the same one or it would promise a contrast the saved
 * palette does not have.
 */
function foregroundFor(color: string): string {
  if (!HEX_COLOR.test(color)) return "#191614";

  const channel = (start: number) => {
    const raw = Number.parseInt(color.slice(start, start + 2), 16) / 255;

    return raw <= 0.040_45 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  const withWhite = 1.05 / (luminance + 0.05);
  const withBlack = (luminance + 0.05) / 0.05;

  return withWhite >= withBlack ? "#faf8f5" : "#191614";
}

/** The server's own rules, checked before the request so the error is immediate. */
function themeProblem(colors: {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  radius: string;
}): string | null {
  if (!HEX_COLOR.test(colors.primaryColor.trim())) {
    return "A cor principal precisa estar no formato #rrggbb (por exemplo, #191614).";
  }

  if (!HEX_COLOR.test(colors.accentColor.trim())) {
    return "A cor de destaque precisa estar no formato #rrggbb (por exemplo, #191614).";
  }

  if (!HEX_COLOR.test(colors.backgroundColor.trim())) {
    return "A cor de fundo precisa estar no formato #rrggbb (por exemplo, #191614).";
  }

  const radius = Number(colors.radius.trim());

  if (!/^\d+$/.test(colors.radius.trim()) || radius > 32) {
    return "O arredondamento precisa ser um número inteiro entre 0 e 32.";
  }

  return null;
}

/** A colour that is safe to paint: an invalid draft keeps the last saved one. */
function paintable(value: string, fallback: string): string {
  return HEX_COLOR.test(value) ? value : fallback;
}

export default function StoreSettingsRoute() {
  const { storeSlug } = useSession();
  const insets = useSafeAreaInsets();

  const theme = useQuery({
    queryKey: ["theme", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await getPanelStoreTheme(storeSlug);

      if (response.status !== 200) throw new Error(`O tema da loja respondeu ${response.status}.`);

      return response.data;
    },
  });

  const seo = useQuery({
    queryKey: ["seo", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await getPanelStoreSeo(storeSlug);

      if (response.status !== 200) throw new Error(`O SEO da loja respondeu ${response.status}.`);

      return response.data;
    },
  });

  if (!storeSlug) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: "Loja" }} />
        <EmptyState
          title="Nenhuma loja selecionada"
          message="Escolha uma loja para editar as configurações."
        />
      </View>
    );
  }

  if (theme.isPending || seo.isPending) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: "Loja" }} />
        <Loading />
      </View>
    );
  }

  if (!theme.data || !seo.data) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: "Loja" }} />
        <EmptyState
          title="Configurações indisponíveis"
          message="Não foi possível carregar os dados da loja."
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={
        <RefreshControl
          refreshing={theme.isRefetching || seo.isRefetching}
          onRefresh={() => {
            void theme.refetch();
            void seo.refetch();
          }}
        />
      }
    >
      <Stack.Screen options={{ title: "Loja" }} />

      <View className="gap-5">
        <ThemeEditor storeSlug={storeSlug} initial={theme.data} />
        <SeoEditor storeSlug={storeSlug} initial={seo.data.settings} />
      </View>
    </ScrollView>
  );
}

/**
 * The store palette: three colours and a corner radius, painted by the web
 * storefront and the native app. There is no dark variant and no per-component
 * override; the API derives the readable ink from each surface.
 */
function ThemeEditor({ storeSlug, initial }: { storeSlug: string; initial: PanelTheme }) {
  const queryClient = useQueryClient();
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [accentColor, setAccentColor] = useState(initial.accentColor);
  const [backgroundColor, setBackgroundColor] = useState(initial.backgroundColor);
  const [radius, setRadius] = useState(String(initial.radius));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async (input: SaveThemeInput) => {
      const response = await savePanelStoreTheme(storeSlug, input);

      if (response.status === 403) {
        throw new Error("Você não tem permissão para mudar as cores da loja.");
      }

      if (response.status !== 200) throw new Error(THEME_ERROR);

      return response.data;
    },
    onSuccess: (theme) => {
      setPrimaryColor(theme.primaryColor);
      setAccentColor(theme.accentColor);
      setBackgroundColor(theme.backgroundColor);
      setRadius(String(theme.radius));
      setSaved(true);

      queryClient.setQueryData<PanelTheme>(["theme", storeSlug], theme);
      void queryClient.invalidateQueries({ queryKey: ["theme", storeSlug] });
    },
    onError: (cause) => {
      setError(cause.message);
    },
  });

  const previewBackground = paintable(backgroundColor, initial.backgroundColor);
  const previewPrimary = paintable(primaryColor, initial.primaryColor);
  const previewAccent = paintable(accentColor, initial.accentColor);
  const previewForeground = foregroundFor(previewBackground);
  const parsedRadius = Number(radius);

  const previewRadius =
    Number.isInteger(parsedRadius) && parsedRadius >= 0 && parsedRadius <= 32
      ? parsedRadius
      : initial.radius;

  function save() {
    setError(null);
    setSaved(false);

    const problem = themeProblem({ primaryColor, accentColor, backgroundColor, radius });

    if (problem) {
      setError(problem);

      return;
    }

    mutation.mutate({
      primaryColor: primaryColor.trim(),
      accentColor: accentColor.trim(),
      backgroundColor: backgroundColor.trim(),
      radius: Number(radius.trim()),
    });
  }

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-card-foreground">Cores da loja</Text>
      <Text className="text-sm text-muted-foreground">
        A vitrine na web e o aplicativo usam esta paleta. O texto e o contraste são calculados
        automaticamente a partir da cor de fundo.
      </Text>

      {/* The preview paints the candidate palette, so it cannot use a theme token here. */}
      <View
        className="gap-3 rounded-xl border border-border p-4"
        style={{ backgroundColor: previewBackground, borderRadius: previewRadius }}
      >
        <Text className="text-xs tracking-wide uppercase" style={{ color: previewForeground }}>
          Prévia
        </Text>
        <Text className="text-base font-semibold" style={{ color: previewForeground }}>
          Nome de um item do cardápio
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Text
            className="px-3 py-2 text-sm font-medium"
            style={{
              backgroundColor: previewPrimary,
              color: foregroundFor(previewPrimary),
              borderRadius: previewRadius,
            }}
          >
            Botão principal
          </Text>
          <Text
            className="px-3 py-2 text-sm"
            style={{
              backgroundColor: previewAccent,
              color: foregroundFor(previewAccent),
              borderRadius: previewRadius,
            }}
          >
            Destaque
          </Text>
        </View>
      </View>

      <HexField
        label="Cor principal"
        description="Botões, preços e a barra do aplicativo."
        value={primaryColor}
        onChange={(value) => {
          setPrimaryColor(value);
          setSaved(false);
        }}
      />

      <HexField
        label="Cor de destaque"
        description="Faixas, etiquetas e estados de seleção."
        value={accentColor}
        onChange={(value) => {
          setAccentColor(value);
          setSaved(false);
        }}
      />

      <HexField
        label="Cor de fundo"
        description="O fundo de toda a vitrine."
        value={backgroundColor}
        onChange={(value) => {
          setBackgroundColor(value);
          setSaved(false);
        }}
      />

      <View className="gap-1">
        <Text className="text-sm font-medium text-foreground">Arredondamento</Text>
        <TextInput
          accessibilityLabel="Arredondamento"
          className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          keyboardType="number-pad"
          maxLength={2}
          value={radius}
          onChangeText={(value) => {
            setRadius(value);
            setSaved(false);
          }}
        />
        <Text className="text-xs text-muted-foreground">
          Em pixels, de 0 (cantos retos) a 32. Cartões e botões escalam a partir dele.
        </Text>
      </View>

      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      {saved ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          Cores da loja salvas.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: mutation.isPending }}
        className="items-center rounded-lg bg-primary px-4 py-3 active:opacity-80"
        disabled={mutation.isPending}
        onPress={save}
      >
        <Text className="text-sm font-semibold text-primary-foreground">
          {mutation.isPending ? "Salvando…" : "Salvar cores"}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The store-level SEO defaults: the templates every page without its own
 * override inherits. The social image has no mobile picker yet, so the write
 * sends the stored value unchanged instead of clearing it.
 */
function SeoEditor({ storeSlug, initial }: { storeSlug: string; initial: StoreSeoSettings }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initial.seoTitleTemplate ?? "");
  const [description, setDescription] = useState(initial.seoDescriptionTemplate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async (input: SaveStoreSeoInput) => {
      const response = await savePanelStoreSeo(storeSlug, input);

      if (response.status === 403) {
        throw new Error("Você não tem permissão para editar o SEO desta loja.");
      }

      if (response.status !== 200) throw new Error(SEO_ERROR);

      return response.data;
    },
    onSuccess: (seo) => {
      setSaved(true);

      queryClient.setQueryData<StoreSeoOutput>(["seo", storeSlug], seo);
      void queryClient.invalidateQueries({ queryKey: ["seo", storeSlug] });
    },
    onError: (cause) => {
      setError(cause.message);
    },
  });

  function save() {
    setError(null);
    setSaved(false);
    mutation.mutate({
      seoTitleTemplate: title === "" ? null : title,
      seoDescriptionTemplate: description === "" ? null : description,
      seoSocialImageUrl: initial.seoSocialImageUrl,
    });
  }

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-card-foreground">SEO padrão</Text>
      <Text className="text-sm text-muted-foreground">
        Todo produto, kit, categoria, departamento, tag ou cupom sem SEO próprio usa estes modelos.
        Use %store%, %entity% e %city%. Vazio = o nome do item.
      </Text>
      <Text className="text-xs text-muted-foreground">
        A imagem para redes sociais é editada no painel da web.
      </Text>

      <View className="gap-1">
        <Text className="text-sm font-medium text-foreground">Modelo do título</Text>
        <TextInput
          accessibilityLabel="Modelo do título"
          autoCapitalize="none"
          autoCorrect={false}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          maxLength={120}
          placeholder="%entity% | %store%"
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            setSaved(false);
          }}
        />
      </View>

      <View className="gap-1">
        <Text className="text-sm font-medium text-foreground">Modelo da descrição</Text>
        <TextInput
          accessibilityLabel="Modelo da descrição"
          autoCapitalize="none"
          autoCorrect={false}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          maxLength={200}
          placeholder="%entity% com entrega em %city% — %store%"
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            setSaved(false);
          }}
        />
      </View>

      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      {saved ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          SEO da loja salvo.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: mutation.isPending }}
        className="items-center rounded-lg bg-primary px-4 py-3 active:opacity-80"
        disabled={mutation.isPending}
        onPress={save}
      >
        <Text className="text-sm font-semibold text-primary-foreground">
          {mutation.isPending ? "Salvando…" : "Salvar SEO"}
        </Text>
      </Pressable>
    </View>
  );
}

function HexField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        maxLength={7}
        spellCheck={false}
        value={value}
        onChangeText={onChange}
      />
      <Text className="text-xs text-muted-foreground">{description}</Text>
    </View>
  );
}
