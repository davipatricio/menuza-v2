import { usePreventRemove } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

/**
 * Guard an edit screen against the back gesture and the Android back button.
 *
 * `usePreventRemove` is what the native stack consults before it pops, so this
 * covers the predictive back preview as well as the header button. Leaving must
 * go through the callback's `repeat`, which clears the prevention before it
 * re-dispatches the action — dispatching the action directly would be blocked
 * again by the same guard and the screen would never close.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  const [allowed, setAllowed] = useState(false);

  usePreventRemove(dirty && !allowed, ({ repeat }) => {
    Alert.alert("Alterações não salvas", "Sair desta tela e descartar o que foi editado?", [
      { text: "Continuar editando", style: "cancel" },
      {
        text: "Descartar",
        style: "destructive",
        onPress: () => {
          setAllowed(true);
          repeat();
        },
      },
    ]);
  });
}
