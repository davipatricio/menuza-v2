import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";

interface AlertState {
  silenced: boolean;
  alarming: boolean;
  toggle: () => void;
}

const AlertContext = createContext<AlertState | null>(null);

export function useAlert(): AlertState {
  const value = use(AlertContext);

  if (!value) throw new Error("useAlert was called outside AlertProvider");

  return value;
}

/**
 * The new-order alarm: one looping tone while an order sits in `pending`.
 *
 * Two rules, both learned the hard way:
 * - It only starts on a *rise* in the pending count. Opening the app in the
 *   morning with three orders already waiting must stay silent; otherwise the
 *   first thing the operator meets is an alarm nothing explains.
 * - It pauses when the app leaves the foreground. A loop that keeps ringing in
 *   a pocket is an alarm nobody can answer.
 */
export function AlertProvider({
  pendingCount,
  children,
}: {
  pendingCount: number;
  children: ReactNode;
}) {
  const [silenced, setSilenced] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [board, setBoard] = useState({ count: pendingCount, alarming: false });
  const player = useAudioPlayer(require("../../assets/order-alert.wav"));

  // Adjusting state while rendering, the documented alternative to an effect:
  // the alarm is derived from the count, so it is decided here, in one pass.
  if (board.count !== pendingCount) {
    const alarming =
      pendingCount > board.count ? true : pendingCount === 0 ? false : board.alarming;

    setBoard({ count: pendingCount, alarming });
  }

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react/immutability -- expo-audio exposes `loop` as a mutable player property, with no setter.
    player.loop = true;
  }, [player]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );

    return () => subscription.remove();
  }, []);

  const ringing = board.alarming && !silenced && foreground;

  useEffect(() => {
    if (ringing) {
      player.play();

      return;
    }

    player.pause();
  }, [ringing, player]);

  useEffect(() => {
    return () => {
      player.pause();
    };
  }, [player]);

  return (
    <AlertContext
      value={{
        silenced,
        alarming: board.alarming,
        toggle: () => setSilenced((current) => !current),
      }}
    >
      {children}
    </AlertContext>
  );
}
