import { deleteAccount, listAccountSessions } from "@menuza/api-client/tenant";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChipGroup } from "@/components/form.tsx";
import { useSession } from "@/lib/session.tsx";
import { type ThemeMode, useThemeMode } from "@/lib/theme-mode.tsx";

const THEME_OPTIONS = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
] as const satisfies readonly { value: ThemeMode; label: string }[];

/** `2026-11-15T18:04:00.000Z` → `15/11/2026, 18:04`, the session stamp. */
function sessionStamp(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

/**
 * The signed-in member, the palette and their open sessions. An account spans
 * stores, so the session read takes no store slug; revocation stays on the web.
 *
 * Deletion is a real `DELETE /account` call, not a request queue: the store the
 * member solely owned is archived, so the orders already issued stay readable.
 *
 * Implements Apple Guideline 5.1.1(v) (in-app account deletion) and Google Play
 * User Data policy (privacy policy and terms access).
 */
export default function AccountSettingsRoute() {
  const router = useRouter();
  const { member, signOut } = useSession();
  const { mode, setMode } = useThemeMode();
  const insets = useSafeAreaInsets();

  const sessions = useQuery({
    queryKey: ["account", "sessions"],
    queryFn: async () => {
      const response = await listAccountSessions();

      if (response.status !== 200) throw new Error(`As sessões responderam ${response.status}.`);

      return response.data.sessions;
    },
  });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <Stack.Screen options={{ title: "Conta" }} />

      <View className="gap-5">
        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-card-foreground">Conta</Text>
          <Text className="text-sm font-medium text-card-foreground">
            {member?.name ?? member?.email ?? "Sessão não identificada"}
          </Text>
          {member?.name ? (
            <Text className="text-sm text-muted-foreground">{member.email}</Text>
          ) : null}
        </View>

        <View className="gap-3 rounded-2xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-card-foreground">Aparência</Text>
          <ChipGroup label="Tema" onChange={setMode} options={THEME_OPTIONS} value={mode} />
          <Text className="text-xs text-muted-foreground">
            O tema vale só para este dispositivo; a loja continua com as cores dela.
          </Text>
        </View>

        <View className="gap-3 rounded-2xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-card-foreground">Sessões ativas</Text>
          <Text className="text-sm text-muted-foreground">
            Cada linha é um dispositivo com uma sessão aberta nesta conta.
          </Text>

          {sessions.isPending ? (
            <Text className="text-sm text-muted-foreground">Carregando…</Text>
          ) : null}

          {sessions.isError ? (
            <Text className="text-sm text-destructive">Não foi possível carregar as sessões.</Text>
          ) : null}

          {sessions.data?.length === 0 ? (
            <Text className="text-sm text-muted-foreground">Nenhuma sessão ativa.</Text>
          ) : null}

          {sessions.data?.map((session) => (
            <View key={session.id} className="gap-1 rounded-xl border border-border px-3 py-3">
              <Text className="text-sm font-medium text-card-foreground">
                {session.current ? "Esta sessão" : "Outra sessão"}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Criada em {sessionStamp(session.createdAt)} · último uso{" "}
                {sessionStamp(session.lastUsedAt)} · expira em {sessionStamp(session.expiresAt)}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-2.5">
          <Pressable
            accessibilityRole="button"
            className="min-h-[48px] items-center justify-center rounded-xl border border-border bg-card px-4 py-3 active:opacity-80"
            onPress={() => router.push("/management/settings/password")}
          >
            <Text className="text-sm font-semibold text-foreground">Trocar senha</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            className="min-h-[48px] items-center justify-center rounded-xl border border-border bg-card px-4 py-3 active:opacity-80"
            onPress={() => {
              void signOut().then(() => router.replace("/"));
            }}
          >
            <Text className="text-sm font-semibold text-destructive">Sair</Text>
          </Pressable>
        </View>

        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <Text className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Privacidade e Diretrizes
          </Text>
          <Text className="text-xs text-muted-foreground">
            O Menuza opera em conformidade com as diretrizes do Google Play e da Apple App Store.
          </Text>
          <View className="flex-row items-center justify-between pt-2">
            <Pressable
              accessibilityRole="link"
              className="min-h-[44px] justify-center py-1"
              onPress={() =>
                void Linking.openURL("https://menuza.com.br/privacy").catch(() => null)
              }
            >
              <Text className="text-xs font-medium text-primary underline">
                Política de Privacidade
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              className="min-h-[44px] justify-center py-1"
              onPress={() => void Linking.openURL("https://menuza.com.br/terms").catch(() => null)}
            >
              <Text className="text-xs font-medium text-primary underline">Termos de Uso</Text>
            </Pressable>
          </View>
        </View>

        <View className="gap-3 rounded-2xl border border-destructive/40 bg-card p-4">
          <Text className="text-base font-semibold text-destructive">Excluir conta</Text>
          <Text className="text-sm text-muted-foreground">
            Exclui sua conta e encerra suas sessões em todos os dispositivos. A loja da qual você é
            o único responsável é arquivada: ela sai do ar, mas os pedidos já emitidos continuam
            valendo para quem comprou.
          </Text>

          <DeleteAccountButton email={member?.email ?? null} />
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * The deletion control, with its own confirmation and progress state.
 *
 * It lives apart from the screen so the screen keeps one query and no
 * confirmation branching of its own. Deleting is a real `DELETE /account`: the
 * handler verifies the typed e-mail against the member that owns the cookie.
 */
function DeleteAccountButton({ email }: { email: string | null }) {
  const router = useRouter();
  const { signOut } = useSession();
  const [error, setError] = useState<string | null>(null);

  const deletion = useMutation({
    mutationFn: async (confirmed: string) => {
      const response = await deleteAccount({ email: confirmed });

      if (response.status !== 200) throw new Error(response.data.message);

      return response.data;
    },
    onSuccess: (result) => {
      void signOut().then(() => {
        Alert.alert(
          "Conta excluída",
          result.storesArchived > 0
            ? "Sua conta foi excluída. A loja que era só sua foi arquivada e os pedidos já emitidos continuam disponíveis para os clientes."
            : "Sua conta foi excluída.",
          [{ text: "OK", onPress: () => router.replace("/") }],
        );
      });
    },
    onError: (failure: Error) => setError(failure.message),
  });

  if (!email) return null;

  const confirming = email;

  function confirm() {
    setError(null);

    Alert.alert(
      "Excluir conta",
      "Sua conta será excluída agora. Lojas das quais você é o único responsável são arquivadas, e os pedidos já emitidos continuam valendo. Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir minha conta",
          style: "destructive",
          onPress: () => deletion.mutate(confirming),
        },
      ],
    );
  }

  return (
    <>
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deletion.isPending, busy: deletion.isPending }}
        className="min-h-[48px] items-center justify-center rounded-xl bg-destructive px-4 py-3 active:opacity-80 disabled:opacity-60"
        disabled={deletion.isPending}
        onPress={confirm}
      >
        <Text className="text-sm font-semibold text-white">
          {deletion.isPending ? "Excluindo…" : "Excluir minha conta"}
        </Text>
      </Pressable>
    </>
  );
}
