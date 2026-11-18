import { Redirect, Stack } from "expo-router";

import { Loading } from "@/components/screen.tsx";
import { useSession } from "@/lib/session.tsx";

/**
 * The management stack: one screen per dashboard section the web exposes.
 * Every screen reads with the session cookie bound by `SessionProvider`, so the
 * stack itself carries no data logic.
 *
 * The gate is here, not per screen: a revoked cookie or a store deselected
 * mid-session sends the whole stack back to the sign-in entry instead of
 * leaving eight screens loading forever.
 */
export default function ManagementLayout() {
  const { status, storeSlug } = useSession();

  if (status === "loading") return <Loading />;

  if (status !== "authenticated" || !storeSlug) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Voltar",
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    />
  );
}
