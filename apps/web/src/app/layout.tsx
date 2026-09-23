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

export const metadata: Metadata = {
  title: "Menuza",
  description: "Fundação local do Menuza",
  applicationName: "Menuza",
  manifest: "/manifest.webmanifest",
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
