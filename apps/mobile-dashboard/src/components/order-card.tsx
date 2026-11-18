import type { PanelOrder } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import { Text, View } from "react-native";

import { PressableScale } from "@/components/pressable.tsx";
import { financialLabel, fulfilmentLabel, orderStamp } from "@/lib/labels.ts";

interface BadgeStyle {
  bg: string;
  text: string;
  border: string;
}

/**
 * Maps fulfilment status to accessible semantic styling tokens.
 */
function fulfilmentBadgeStyle(status: string): BadgeStyle {
  switch (status) {
    case "pending":
      return {
        bg: "bg-blue-500/15",
        text: "text-blue-700 dark:text-blue-300",
        border: "border-blue-500/30",
      };
    case "preparing":
      return {
        bg: "bg-amber-500/15",
        text: "text-amber-800 dark:text-amber-300",
        border: "border-amber-500/30",
      };
    case "ready":
    case "ready_for_pickup":
    case "completed":
      return {
        bg: "bg-emerald-500/15",
        text: "text-emerald-800 dark:text-emerald-300",
        border: "border-emerald-500/30",
      };
    case "canceled":
      return { bg: "bg-destructive/15", text: "text-destructive", border: "border-destructive/30" };
    default:
      return { bg: "bg-accent", text: "text-accent-foreground", border: "border-border" };
  }
}

/** One order row: code, buyer, total and both status axes. */
export function OrderCard({ order, onPress }: { order: PanelOrder; onPress: () => void }) {
  const fulfilment = fulfilmentBadgeStyle(order.fulfilmentStatus);

  return (
    <PressableScale
      accessibilityLabel={`Pedido ${order.code}, ${order.customerName}, ${formatBrl(order.totalCents)}`}
      className="gap-2.5 rounded-2xl border border-border bg-card p-4"
      onPress={onPress}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-bold tracking-tight text-card-foreground">
            #{order.code}
          </Text>
          <View className={`rounded-md border px-2 py-0.5 ${fulfilment.bg} ${fulfilment.border}`}>
            <Text className={`text-xs font-semibold ${fulfilment.text}`}>
              {fulfilmentLabel(order.fulfilmentStatus)}
            </Text>
          </View>
        </View>
        <Text className="text-base font-semibold text-foreground tabular-nums">
          {formatBrl(order.totalCents)}
        </Text>
      </View>

      <Text className="text-sm font-medium text-card-foreground" numberOfLines={1}>
        {order.customerName}
      </Text>

      <View className="flex-row items-center justify-between border-t border-border/60 pt-2">
        <Text className="text-xs text-muted-foreground">{orderStamp(order.createdAt)}</Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs font-medium text-muted-foreground">
            {financialLabel(order.financialStatus)}
          </Text>
          <Text className="text-sm text-muted-foreground/60 select-none">›</Text>
        </View>
      </View>
    </PressableScale>
  );
}
