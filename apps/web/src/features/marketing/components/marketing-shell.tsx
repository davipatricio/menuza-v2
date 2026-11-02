import { Link } from "@tanstack/react-router";

/** Shared chrome for the marketing pages: wordmark, section nav and footnote. */
export function MarketingHeader() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6">
      <span className="text-xl font-semibold">Menuza</span>
      <nav aria-label="Principal" className="flex gap-4 text-sm">
        <Link to="/about" preload="intent" className="hover:underline">
          Sobre
        </Link>
        <Link to="/pricing" preload="intent" className="hover:underline">
          Planos
        </Link>
        <Link to="/contact" preload="intent" className="hover:underline">
          Contato
        </Link>
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">
      <p>© Menuza · Fundação local · pt-BR</p>
    </footer>
  );
}

/** A secondary marketing page: heading, one paragraph, back link. */
export function MarketingPage({ heading, children }: { heading: string; children: string }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h2 className="text-3xl font-bold tracking-tight">{heading}</h2>
      <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground">{children}</p>
      <Link to="/" className="mt-8 inline-block text-sm hover:underline">
        Voltar para o início
      </Link>
    </main>
  );
}
