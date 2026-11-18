import { OverviewScreen } from "@/components/overview-screen.tsx";
import { Page } from "@/components/screen.tsx";

/**
 * Início: the tab's landing screen and the app's home. The body lives in
 * `OverviewScreen`, so this route only owns the chrome.
 *
 * No `Stack.Screen` header: the native tab bar draws no header, and the screen
 * carries its own store name and title.
 */
export default function InicioRoute() {
  return (
    <Page>
      <OverviewScreen />
    </Page>
  );
}
