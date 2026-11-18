import { Pressable, ScrollView, Text } from "react-native";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * A horizontal segmented control: one row of mutually exclusive tabs.
 *
 * The row scrolls sideways, so four labels never truncate on a narrow phone.
 * Each segment is 40 px tall inside a row with vertical padding, and the hit
 * slop adds 4 px top and bottom, so the tappable area clears the 44 px Apple
 * HIG minimum. A segment does not scale on press: it switches a filter, it is
 * not a card being opened.
 *
 * `flexGrow: 0` is load-bearing — React Native's horizontal ScrollView base
 * style grows, so without it this row would eat the list's height.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      accessibilityRole="tablist"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityLabel={
              option.count === undefined ? option.label : `${option.label}, ${option.count}`
            }
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={`min-h-[40px] flex-row items-center justify-center gap-1 rounded-xl px-3.5 ${
              selected ? "bg-primary" : "bg-card"
            }`}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => onChange(option.value)}
          >
            <Text
              className={
                selected
                  ? "text-sm font-semibold text-primary-foreground"
                  : "text-sm font-semibold text-muted-foreground"
              }
            >
              {option.label}
            </Text>
            {option.count === undefined ? null : (
              <Text
                className={
                  selected
                    ? "text-xs font-semibold text-primary-foreground tabular-nums"
                    : "text-xs font-semibold text-muted-foreground tabular-nums"
                }
              >
                {option.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
