import Link from "next/link";
import { Button } from "@/components/ui/button.tsx";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6">
        <h1 className="text-xl font-semibold">Menuza</h1>
        <nav aria-label="Principal" className="flex gap-4 text-sm">
          <Link href="/about" className="hover:underline">
            Sobre
          </Link>
          <Link href="/pricing" className="hover:underline">
            Planos
          </Link>
          <Link href="/contact" className="hover:underline">
            Contato
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-16" aria-labelledby="hero-heading">
        <h2 id="hero-heading" className="text-4xl font-bold tracking-tight">
          Sua loja, sem fricção.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-neutral-700 dark:text-neutral-300">
          Menuza é a fundação local para catálogos, pedidos e gestão. Esta é apenas a casca pública
          de apresentação — nenhum produto ou fluxo de compra é entregue nesta fase.
        </p>
        <div className="mt-8 flex gap-3">
          <Button disabled>Em breve</Button>
          <Button variant="outline" disabled>
            Falar com vendas
          </Button>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-sm text-neutral-600 dark:text-neutral-400">
        <p>© Menuza · Fundação local · pt-BR</p>
      </footer>
    </main>
  );
}
