"use client";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle id="store-error-heading">Algo deu errado</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-pretty text-muted-foreground" role="alert">
          Não foi possível carregar esta tela do painel. Tente novamente.
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
