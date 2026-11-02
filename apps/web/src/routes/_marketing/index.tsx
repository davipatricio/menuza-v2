import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button.tsx";
import {
  MarketingFooter,
  MarketingHeader,
} from "@/features/marketing/components/marketing-shell.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/_marketing/")({
  head: () => ({
    meta: [
      { title: pageTitle("Sua loja, sem fricção") },
      {
        name: "description",
        content:
          "Menuza é a fundação local para catálogos, pedidos e gestão. Esta é a casca pública de apresentação.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="min-h-screen">
      <MarketingHeader />

      <section className="mx-auto max-w-5xl px-4 py-16" aria-labelledby="hero-heading">
        <h2 id="hero-heading" className="text-4xl font-bold tracking-tight">
          Sua loja, sem fricção.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground">
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

      <MarketingFooter />
    </main>
  );
}
