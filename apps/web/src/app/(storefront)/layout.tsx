import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";

// The storefront shell (nav + Suspense fallbacks) is static; every page below
// renders per request because the tenant comes from the resolved host, which
// `loading.tsx` defers past the App Shell (Next 16.4 ensureStatic).
export const ensureStatic = "shell";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <nav aria-label="Navegação da loja" className="flex items-center gap-4 text-sm">
          <Link href="/store" className="font-medium underline-offset-4 hover:underline">
            Início
          </Link>
          <Link href="/menu" className="font-medium underline-offset-4 hover:underline">
            Cardápio
          </Link>
        </nav>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
