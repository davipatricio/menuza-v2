import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/**
 * The card press: a 2% scale-in over 90 ms plus a selection haptic.
 *
 * The menu is browsed with one thumb, so the feedback has to land before the
 * navigation animation starts; anything slower reads as a missed tap.
 */
export function PressableScale({
  children,
  onPress,
  className,
  disabled,
  accessibilityLabel,
  accessibilityState,
}: {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityState?: { disabled?: boolean };
}) {
  const scale = useSharedValue(1);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
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
