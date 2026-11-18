import type { PublicStore } from "@menuza/api-client/model";
import { applicationId } from "expo-application";
import { useQuery } from "@tanstack/react-query";
import Storage from "expo-sqlite/kv-store";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { loadStore } from "./api.ts";

/**
 * A published binary carries its store in its package name:
 * `app.menuza.store.<tenantSlug>`. The JS bundle is shared by every store on the
 * update channel, so this is read natively at runtime — never compiled in.
 */
const APP_ID_PREFIX = "app.menuza.store.";

const SAVED_SLUG_KEY = "menuza.store.slug";

export function storeSlugFromApplicationId(applicationId: string | null): string | null {
  if (!applicationId?.startsWith(APP_ID_PREFIX)) return null;

  const slug = applicationId.slice(APP_ID_PREFIX.length);

  return slug.length > 0 ? slug : null;
}

interface Storefront {
  store: PublicStore;
}

const StoreContext = createContext<Storefront | null>(null);

export function useStorefront(): Storefront {
  const value = use(StoreContext);

  if (!value) throw new Error("useStorefront was called outside StoreProvider");

  return value;
}

/**
 * Resolves which store this build belongs to and loads it before any screen
 * renders. A development build has no store package, so it asks once and
 * remembers the answer in SQLite.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [slug, setSlug] = useState<string | null>(() => storeSlugFromApplicationId(applicationId));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (slug) return;

    let cancelled = false;

    void Storage.getItem(SAVED_SLUG_KEY).then((saved) => {
      if (cancelled) return;

      setSlug(saved);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!ready && !slug) {
    return <BootScreen />;
  }

  if (!slug) {
    return (
      <StorePicker
        onSubmit={(value) => {
          void Storage.setItem(SAVED_SLUG_KEY, value);
          setSlug(value);
        }}
      />
    );
  }

  return (
    <StoreLoader slug={slug} onReset={() => setSlug(null)}>
      {children}
    </StoreLoader>
  );
}

function StoreLoader({
  slug,
  onReset,
  children,
}: {
  slug: string;
  onReset: () => void;
  children: ReactNode;
}) {
  const query = useQuery({
    queryKey: ["store", slug],
    queryFn: () => loadStore(slug),
    staleTime: 5 * 60 * 1000,
  });

  if (query.isPending) return <BootScreen />;

  if (query.isError || !query.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Loja indisponível</Text>
        <Text className="text-center text-sm text-muted-foreground">
          Não foi possível carregar {slug}. Confira a conexão e tente de novo.
        </Text>
        <Pressable className="rounded-lg bg-primary px-4 py-2" onPress={() => query.refetch()}>
          <Text className="text-sm font-medium text-primary-foreground">Tentar de novo</Text>
        </Pressable>
        <Pressable onPress={onReset}>
          <Text className="text-sm text-muted-foreground underline">Trocar de loja</Text>
        </Pressable>
      </View>
    );
  }

  return <StoreContext value={{ store: query.data }}>{children}</StoreContext>;
}

function BootScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator />
    </View>
  );
}

function StorePicker({ onSubmit }: { onSubmit: (slug: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <View className="flex-1 justify-center gap-4 bg-background px-6">
      <Text className="text-xl font-semibold text-foreground">Qual loja?</Text>
      <Text className="text-sm text-muted-foreground">
        Este build não é de uma loja publicada. Informe o identificador para abrir a vitrine.
      </Text>
      <TextInput
        className="rounded-lg border border-border bg-card px-3 py-3 text-base text-foreground"
        placeholder="ex.: demo"
        placeholderTextColor="#6b655f"
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={setValue}
      />
      <Pressable
        className="items-center rounded-lg bg-primary px-4 py-3"
        disabled={value.trim().length === 0}
        onPress={() => onSubmit(value.trim().toLowerCase())}
      >
        <Text className="text-sm font-medium text-primary-foreground">Abrir loja</Text>
      </Pressable>
    </View>
  );
}
