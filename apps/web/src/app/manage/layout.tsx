import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";

export default function ManagementLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-neutral-200 pb-4 md:flex-row md:items-center md:justify-between dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-semibold">Menuza · Gestão</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Painel administrativo (foundation)
          </p>
        </div>
        <div className="flex items-center gap-4">
          <nav aria-label="Navegação de Gestão" className="flex items-center gap-3 text-sm">
            <Link href="/manage" className="hover:underline">
              Início
            </Link>
            <Link href="/manage/orders" className="hover:underline">
              Pedidos
            </Link>
            <Link href="/manage/customers" className="hover:underline">
              Clientes
            </Link>
            <Link href="/manage/coupons" className="hover:underline">
              Cupons
            </Link>
            <Link href="/manage/audit" className="hover:underline">
              Auditoria
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
