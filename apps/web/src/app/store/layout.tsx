import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Menuza · Loja</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Vitrine (foundation)</p>
        </div>
        <ThemeToggle />
      </header>
      <main>{children}</main>
    </div>
  );
}
