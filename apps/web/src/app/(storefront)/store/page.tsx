import { Suspense } from "react";
import { CommerceStatusCard } from "@/components/commerce-status-card.tsx";
import { Button } from "@/components/ui/button.tsx";

export default function StorefrontHome() {
  return (
    <section aria-labelledby="storefront-heading" className="space-y-4">
      <h2 id="storefront-heading" className="text-xl font-medium">
        Vitrine
      </h2>
      <p className="text-neutral-700 dark:text-neutral-300">
        Esta é a casca pública do storefront. Nenhum produto ou categoria é renderizado até que os
        fluxos de catálogo sejam entregues.
      </p>
      <Button disabled>Acessar catálogo (em breve)</Button>
      <Suspense
        fallback={<output className="block">Carregando status do serviço de comércio…</output>}
      >
        <CommerceStatusCard />
      </Suspense>
    </section>
  );
}
