import { BottomSheet, Host } from "@expo/ui";
import {
  getPanelOrder,
  getPanelOrderTransitions,
  transitionPanelOrder,
} from "@menuza/api-client/tenant";
import type { OrderAxis, PanelOrderTransition } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, Loading } from "@/components/screen.tsx";
import { financialLabel, fulfilmentLabel, orderStamp } from "@/lib/labels.ts";
import { useSession } from "@/lib/session.tsx";

/**
 * One order plus the moves the API allows right now.
 *
 * The transitions come from the server, already filtered by the caller's
 * capabilities, so this screen never decides who may cancel or refund.
 */
export default function OrderRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { storeSlug } = useSession();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState<PanelOrderTransition | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const order = useQuery({
    queryKey: ["order", storeSlug, code],
    enabled: Boolean(storeSlug && code),
    queryFn: async () => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await getPanelOrder(storeSlug, code);

      if (response.status !== 200) throw new Error(`O pedido respondeu ${response.status}.`);

      return response.data.order;
    },
  });

  const transitions = useQuery({
    queryKey: ["transitions", storeSlug, code],
    enabled: Boolean(storeSlug && code),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await getPanelOrderTransitions(storeSlug, code);

      if (response.status !== 200) return [];

      return response.data.transitions;
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: { axis: OrderAxis; to: string; reason: string | null }) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await transitionPanelOrder(storeSlug, code, input);

      if (response.status !== 200) {
        throw new Error(
          response.status === 409
            ? "O pedido mudou desde que a tela abriu. Atualize e tente de novo."
            : `A mudança respondeu ${response.status}.`,
        );
      }

      return response.data;
    },
    onSuccess: () => {
      setRequesting(null);
      setReason("");
      setError(null);

      void queryClient.invalidateQueries({ queryKey: ["orders", storeSlug] });
      void queryClient.invalidateQueries({ queryKey: ["order", storeSlug, code] });
      void queryClient.invalidateQueries({ queryKey: ["transitions", storeSlug, code] });
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Não foi possível mudar o pedido.");
    },
  });

  if (order.isPending) return <Loading />;

  if (order.isError || !order.data) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <EmptyState title="Pedido indisponível" message="Não foi possível carregar este pedido." />
      </View>
    );
  }

  const detail = order.data;

  function request(transition: PanelOrderTransition) {
    setError(null);

    if (transition.requiresReason) {
      setRequesting(transition);
      setReason("");

      return;
    }

    mutation.mutate({ axis: transition.axis, to: transition.to, reason: null });
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View className="gap-5">
          <View className="gap-2 rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-semibold text-card-foreground">#{detail.code}</Text>
              <Text className="text-lg font-semibold text-card-foreground">
                {formatBrl(detail.totalCents)}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">{detail.customerName}</Text>
            <Text className="text-xs text-muted-foreground">{orderStamp(detail.createdAt)}</Text>

            <View className="flex-row flex-wrap gap-2 pt-1">
              <View className="rounded-md border border-border bg-accent px-2.5 py-1">
                <Text className="text-xs font-semibold text-accent-foreground">
                  {fulfilmentLabel(detail.fulfilmentStatus)}
                </Text>
              </View>
              <View className="rounded-md border border-border bg-card px-2.5 py-1">
                <Text className="text-xs font-semibold text-muted-foreground">
                  {financialLabel(detail.financialStatus)}
                </Text>
              </View>
            </View>
          </View>

          <View className="gap-2.5">
            <Text className="text-sm font-semibold text-foreground">Itens</Text>
            {detail.items.map((item) => (
              <View
                key={item.id}
                className="flex-row items-start justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
              >
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-semibold text-card-foreground">{item.name}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {item.quantity} × {formatBrl(item.unitPriceCents)}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-card-foreground tabular-nums">
                  {formatBrl(item.quantity * item.unitPriceCents)}
                </Text>
              </View>
            ))}
          </View>

          <View className="gap-2 rounded-2xl border border-border bg-card p-4">
            <Row label="Subtotal" value={formatBrl(detail.subtotalCents)} />
            <Row label="Desconto" value={formatBrl(detail.discountCents)} />
            <Row label="Frete" value={formatBrl(detail.shippingCents)} />
            <Row label="Total" value={formatBrl(detail.totalCents)} strong />
          </View>

          <View className="gap-2.5">
            <Text className="text-sm font-semibold text-foreground">Próximas ações</Text>

            {transitions.data?.length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                Nenhuma mudança disponível para o seu papel neste pedido.
              </Text>
            ) : null}

            <View className="flex-row flex-wrap gap-2.5">
              {transitions.data?.map((transition) => (
                <Pressable
                  key={`${transition.axis}-${transition.to}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: mutation.isPending }}
                  className="min-h-[44px] items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 active:opacity-80"
                  disabled={mutation.isPending}
                  hitSlop={4}
                  onPress={() => request(transition)}
                >
                  <Text className="text-sm font-semibold text-foreground">
                    {transition.axis === "financial"
                      ? financialLabel(transition.to)
                      : fulfilmentLabel(transition.to)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
          </View>
        </View>
      </ScrollView>

      <Host>
        <BottomSheet
          isPresented={requesting !== null}
          onDismiss={() => {
            setRequesting(null);
            setReason("");
          }}
          snapPoints={["half"]}
        >
          <View className="gap-3 px-4 pt-2" style={{ paddingBottom: insets.bottom + 16 }}>
            <Text className="text-base font-semibold text-foreground">
              Por que {requesting?.to === "canceled" ? "cancelar" : "mudar"} este pedido?
            </Text>
            <TextInput
              className="min-h-24 rounded-xl border border-border bg-card px-3 py-3 text-base text-foreground"
              multiline
              onChangeText={setReason}
              placeholder="Motivo"
              placeholderTextColor="#6b655f"
              value={reason}
            />
            <View className="flex-row gap-2">
              <Pressable
                className="flex-1 items-center rounded-xl bg-primary px-3 py-3 active:opacity-80"
                disabled={reason.trim().length === 0 || mutation.isPending}
                onPress={() => {
                  if (!requesting) return;

                  mutation.mutate({
                    axis: requesting.axis,
                    to: requesting.to,
                    reason: reason.trim(),
                  });
                }}
              >
                <Text className="text-sm font-semibold text-primary-foreground">Confirmar</Text>
              </Pressable>
              <Pressable
                className="flex-1 items-center rounded-xl border border-border px-3 py-3"
                onPress={() => {
                  setRequesting(null);
                  setReason("");
                }}
              >
                <Text className="text-sm font-semibold text-foreground">Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </BottomSheet>
      </Host>
    </>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Text
        className={
          strong ? "text-sm font-semibold text-card-foreground" : "text-sm text-muted-foreground"
        }
      >
        {label}
      </Text>
      <Text
        className={
          strong ? "text-sm font-semibold text-card-foreground" : "text-sm text-card-foreground"
        }
      >
        {value}
      </Text>
    </View>
  );
}
