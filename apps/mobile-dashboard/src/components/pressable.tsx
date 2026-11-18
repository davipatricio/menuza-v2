import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/**
 * The row press: a 2% scale-in over 90 ms plus a selection haptic.
 *
 * Quick on purpose — a 300 ms spring on every row makes a list of forty feel
 * broken, while 90 ms reads as the surface answering the finger.
 */
export function PressableScale({
  children,
  onPress,
  className,
  disabled,
  accessibilityLabel,
  accessibilityRole = "button",
}: {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link" | "none";
}) {
  const scale = useSharedValue(1);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessible={accessibilityRole !== "none"}
        className={className}
        disabled={disabled}
        onPressIn={() => {
          // eslint-disable-next-line react/immutability -- reanimated shared values are written from the UI thread by design.
          scale.value = withTiming(0.98, { duration: 90 });
        }}
        onPressOut={() => {
          // eslint-disable-next-line react/immutability -- reanimated shared values are written from the UI thread by design.
          scale.value = withTiming(1, { duration: 120 });
        }}
        onPress={() => {
          if (!onPress) return;

          void Haptics.selectionAsync();
          onPress();
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
