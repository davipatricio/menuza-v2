import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/features/marketing/components/marketing-shell.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/_marketing/pricing")({
  head: () => ({ meta: [{ title: pageTitle("Planos") }] }),
  component: () => (
    <MarketingPage heading="Planos">
      Planos e preços ainda não foram definidos. Esta é apenas a casca pública de apresentação do
      Menuza.
    </MarketingPage>
  ),
});
