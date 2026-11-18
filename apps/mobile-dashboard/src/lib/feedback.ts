import * as Haptics from "expo-haptics";

/**
 * The app's vibration vocabulary, in one place.
 *
 * Two rules keep it useful: a save that worked must not feel like a save that
 * failed, and nothing fires on a screen the operator is only scrolling.
 */
export function successFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function errorFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

/** A new order: the warning pattern, so it is noticed off-screen. */
export function newOrderFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
