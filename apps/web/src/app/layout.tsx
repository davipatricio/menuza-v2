import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { QueryProvider } from "@/components/query-provider.tsx";
import { OfflineListener } from "@/components/offline-listener.tsx";
import { SerwistProvider } from "@serwist/turbopack/react";

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
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <SerwistProvider swUrl="/serwist/sw.js">
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <QueryProvider>
              <OfflineListener />
              {children}
            </QueryProvider>
          </ThemeProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
