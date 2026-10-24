"use client";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle id="catalog-error-heading">Não foi possível carregar o catálogo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-pretty text-muted-foreground" role="alert">
          Algo falhou ao carregar esta área do catálogo. Tente novamente.
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={() => reset()}>
            Tentar novamente
          </Button>
        </div>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">Erro: {error.digest}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
