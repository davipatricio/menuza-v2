import { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/lib/session.tsx";

/** Email + password against `/tenant/session/login`; the cookie is the session. */
export function LoginForm() {
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !pending;

  async function submit() {
    if (!canSubmit) return;

    setPending(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-6">
          <View className="gap-1.5">
            <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-primary">
              <Text className="text-lg font-bold text-primary-foreground">M</Text>
            </View>
            <Text className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Menuza Pedidos
            </Text>
            <Text className="text-2xl font-bold tracking-tight text-foreground">Entrar</Text>
            <Text className="text-sm leading-relaxed text-muted-foreground">
              Use a mesma conta do painel web. A sessão fica guardada de forma segura no aparelho.
            </Text>
          </View>

          <View className="gap-3.5">
            <View className="gap-1.5">
              <Text className="text-sm font-medium text-foreground">E-mail</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                className="min-h-[48px] rounded-xl border border-border bg-card px-3.5 py-3 text-base text-foreground"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="voce@loja.com"
                placeholderTextColor="#6b655f"
                value={email}
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-sm font-medium text-foreground">Senha</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="current-password"
                className="min-h-[48px] rounded-xl border border-border bg-card px-3.5 py-3 text-base text-foreground"
                onChangeText={setPassword}
                onSubmitEditing={() => void submit()}
                placeholder="••••••••"
                placeholderTextColor="#6b655f"
                secureTextEntry
                value={password}
              />
            </View>
          </View>

          {error ? (
            <View className="rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5">
              <Text className="text-sm font-medium text-destructive">{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit, busy: pending }}
            className={`min-h-[48px] items-center justify-center rounded-xl px-4 py-3 ${
              canSubmit ? "bg-primary active:opacity-85" : "bg-muted"
            }`}
            disabled={!canSubmit}
            onPress={() => void submit()}
          >
            <Text
              className={`text-sm font-semibold ${
                canSubmit ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {pending ? "Entrando…" : "Entrar"}
            </Text>
          </Pressable>

          <View className="mt-2 flex-row items-center justify-center gap-3">
            <Pressable
              accessibilityRole="link"
              className="py-2"
              onPress={() =>
                void Linking.openURL("https://menuza.com.br/privacy").catch(() => null)
              }
            >
              <Text className="text-xs text-muted-foreground underline">
                Política de Privacidade
              </Text>
            </Pressable>
            <Text className="text-xs text-muted-foreground">•</Text>
            <Pressable
              accessibilityRole="link"
              className="py-2"
              onPress={() => void Linking.openURL("https://menuza.com.br/terms").catch(() => null)}
            >
              <Text className="text-xs text-muted-foreground underline">Termos de Uso</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
