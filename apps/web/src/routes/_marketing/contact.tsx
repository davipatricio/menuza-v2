import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/features/marketing/components/marketing-shell.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/_marketing/contact")({
  head: () => ({ meta: [{ title: pageTitle("Contato") }] }),
  component: () => (
    <MarketingPage heading="Contato">
      Canais de contato ainda não estão ativos. Esta é apenas a casca pública de apresentação do
      Menuza.
    </MarketingPage>
  ),
});
