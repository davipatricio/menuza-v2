import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/features/marketing/components/marketing-shell.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/_marketing/about")({
  head: () => ({ meta: [{ title: pageTitle("Sobre") }] }),
  component: () => (
    <MarketingPage heading="Sobre">
      Menuza é a fundação local para catálogos, pedidos e gestão. Esta página ainda é um esboço:
      nenhum conteúdo institucional foi definido nesta fase.
    </MarketingPage>
  ),
});
