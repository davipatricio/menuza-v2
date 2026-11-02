import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";

/** The storefront shell's nav. Static by construction: no per-request read. */
export function StoreHeader() {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <nav aria-label="Navegação da loja" className="flex items-center gap-4 text-sm">
        <Link
          to="/store"
          className="font-medium underline-offset-4 hover:underline"
          activeProps={{ className: "underline" }}
        >
          Início
        </Link>
        <Link
          to="/menu"
          className="font-medium underline-offset-4 hover:underline"
          activeProps={{ className: "underline" }}
        >
          Cardápio
        </Link>
      </nav>
      <ThemeToggle />
    </header>
  );
}
