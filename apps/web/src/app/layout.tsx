import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { QueryProvider } from "@/components/query-provider.tsx";
import { DevServiceWorkerReset } from "@/components/dev-service-worker-reset.tsx";
import { OfflineListener } from "@/components/offline-listener.tsx";
import { SerwistProvider } from "@serwist/turbopack/react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

// One family, variable weight. Exposed as `--font-inter` so the Tailwind
// `--font-sans` token resolves to it (see globals.css `@theme`).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// A loja define o próprio título em `generateMetadata`; aqui só o template que
// ele herda (`Cardápio` vira `Cardápio · Menuza`), o padrão das páginas
// institucionais e uma base para as URLs relativas que sobrarem. O esquema é o
// do ambiente: `https` em produção, `http` no local.
const mainDomain = (process.env.WEB_MAIN_DOMAIN ?? "").trim();

const mainOrigin = mainDomain
  ? `${process.env.NODE_ENV === "production" ? "https" : "http"}://${mainDomain}`
  : null;

export const metadata: Metadata = {
  title: { default: "Menuza", template: "%s · Menuza" },
  description:
    "Cardápios, pedidos e gestão de lojas de comida em um só lugar. Monte o pedido pelo cardápio online da loja.",
  applicationName: "Menuza",
  manifest: "/manifest.webmanifest",
  metadataBase: mainOrigin ? new URL(mainOrigin) : undefined,
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={inter.variable}>
      <body className="bg-background font-sans text-foreground antialiased">
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <QueryProvider>
              <NuqsAdapter>
                <DevServiceWorkerReset />
                <OfflineListener />
                {children}
              </NuqsAdapter>
            </QueryProvider>
          </ThemeProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
