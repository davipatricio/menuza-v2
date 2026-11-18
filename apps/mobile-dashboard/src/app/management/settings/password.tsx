import { changeAccountPassword } from "@menuza/api-client/tenant";
import { Stack } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { FormScreen, TextField } from "@/components/form.tsx";
import { useUnsavedChangesGuard } from "@/lib/navigation.ts";

const GENERIC_ERROR = "Não foi possível trocar a senha. Tente novamente.";

/**
 * Password change. The server revokes every other session on success, so the
 * copy says so before the operator taps save; the current session survives.
 */
export default function PasswordSettingsRoute() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = Boolean(currentPassword || newPassword || confirmation);

  useUnsavedChangesGuard(dirty && !saved);

  async function save() {
    setError(null);
    setSaved(false);

    if (newPassword.length < 8) {
      setError("A nova senha precisa de pelo menos 8 caracteres.");

      return;
    }

    if (newPassword !== confirmation) {
      setError("A confirmação não confere com a nova senha.");

      return;
    }

    setSaving(true);

    try {
      const response = await changeAccountPassword({ currentPassword, newPassword });

      if (response.status !== 200) {
        setError(GENERIC_ERROR);

        return;
      }

      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen
      error={error}
      onSave={() => void save()}
      saveLabel="Trocar senha"
      saving={saving}
      saved={saved}
      title="Senha"
    >
      <Stack.Screen options={{ title: "Senha" }} />

      <View className="gap-4 rounded-xl border border-border bg-card p-4">
        <Text className="text-sm text-muted-foreground">
          Trocar a senha encerra as outras sessões desta conta; esta continua aberta.
        </Text>
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          label="Senha atual"
          onChangeText={setCurrentPassword}
          secureTextEntry
          value={currentPassword}
        />
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          hint="Mínimo de 8 caracteres."
          label="Nova senha"
          onChangeText={setNewPassword}
          secureTextEntry
          value={newPassword}
        />
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          label="Confirmar nova senha"
          onChangeText={setConfirmation}
          secureTextEntry
          value={confirmation}
        />
      </View>
    </FormScreen>
  );
}
