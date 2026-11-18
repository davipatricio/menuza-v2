import "../styles/globals.css";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { OfflineListener } from "@/components/offline-listener.tsx";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { QueryProvider } from "@/features/shell/components/query-provider.tsx";

/**
 * Cancels native form submission from the moment the document parses.
 *
 * React attaches `onSubmit` only at hydration, but the server HTML's forms are
 * already interactive: a submit before then follows the native path, navigating
 * the browser to a POST of the page URL and discarding everything the user typed
 * — login credentials included. Every form in this app is driven by JavaScript,
 * so the native path is always a bug; React handlers are unaffected.
 */
const NATIVE_SUBMIT_GUARD =
  "document.addEventListener('submit', function (event) { event.preventDefault(); }, true)";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Menuza" },
      {
        name: "description",
        content:
          "Cardápios, pedidos e gestão de lojas de comida em um só lugar. Monte o pedido pelo cardápio online da loja.",
      },
      { name: "theme-color", content: "#000000" },
    ],
    links: [{ rel: "manifest", href: "/manifest.webmanifest" }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: NATIVE_SUBMIT_GUARD }} />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryProvider client={queryClient}>
            <NuqsAdapter>
              <OfflineListener />
              <Outlet />
            </NuqsAdapter>
          </QueryProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
