import { Host, Switch } from "@expo/ui";
import { Stack } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/pressable.tsx";

/** One field row: a label above whatever control the screen renders. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      {children}
      {hint ? <Text className="text-xs leading-normal text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = "sentences",
  autoCorrect = true,
  multiline = false,
  secureTextEntry = false,
  maxLength,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words";
  autoCorrect?: boolean;
  multiline?: boolean;
  secureTextEntry?: boolean;
  maxLength?: number;
}) {
  return (
    <Field hint={hint} label={label}>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        className="min-h-[48px] rounded-xl border border-border bg-card px-3.5 py-3 text-base text-card-foreground"
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8a8478"
        secureTextEntry={secureTextEntry}
        value={value}
      />
    </Field>
  );
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View className="min-h-[56px] flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-card-foreground">{label}</Text>
        {description ? (
          <Text className="text-sm leading-snug text-muted-foreground">{description}</Text>
        ) : null}
      </View>
      <Host matchContents>
        <Switch onValueChange={onValueChange} value={value} />
      </Host>
    </View>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/** A row of mutually exclusive chips — the native stand-in for a web `<Select>`. Minimum touch target 44px. */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <View
        accessibilityLabel={label}
        accessibilityRole="radiogroup"
        className="flex-row flex-wrap gap-2"
      >
        {options.map((option) => {
          const active = option.value === value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              className={`min-h-[44px] items-center justify-center rounded-xl border px-3.5 py-2.5 ${
                active ? "border-primary bg-primary" : "border-border bg-card"
              }`}
              hitSlop={4}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={
                  active
                    ? "text-sm font-semibold text-primary-foreground"
                    : "text-sm font-medium text-foreground"
                }
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

/** A row of toggleable chips — the native stand-in for a web multi-select. Minimum touch target 44px. */
export function ChipMultiGroup<T extends string>({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: readonly ChipOption<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
}) {
  function toggle(value: T) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return (
    <Field label={label}>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option.value);

          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              className={`min-h-[44px] items-center justify-center rounded-xl border px-3.5 py-2.5 ${
                active ? "border-primary bg-primary" : "border-border bg-card"
              }`}
              hitSlop={4}
              onPress={() => toggle(option.value)}
            >
              <Text
                className={
                  active
                    ? "text-sm font-semibold text-primary-foreground"
                    : "text-sm font-medium text-foreground"
                }
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <Text
      accessibilityRole="alert"
      className="rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
    >
      {message}
    </Text>
  );
}

/**
 * A write screen: keyboard-safe scroll body, a persistent save button and one
 * place for the server's error. Every editor screen uses it so the save
 * affordance never moves between screens.
 */
export function FormScreen({
  title,
  children,
  onSave,
  saving,
  saveLabel = "Salvar",
  error,
  saved,
}: {
  title: string;
  children: ReactNode;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
  error?: string | null;
  saved?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
        <FormError message={error} />
        {saved ? (
          <Text className="text-sm font-medium text-success">Salvo com sucesso.</Text>
        ) : null}
      </ScrollView>
      <View
        className="absolute inset-x-0 bottom-0 border-t border-border bg-background px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <PressableScale
          accessibilityLabel={saveLabel}
          className={`min-h-[48px] items-center justify-center rounded-xl px-4 py-3 ${
            saving ? "bg-primary/60" : "bg-primary"
          }`}
          disabled={saving}
          onPress={onSave}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-primary-foreground">{saveLabel}</Text>
          )}
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}
