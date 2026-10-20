"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex max-w-lg flex-col gap-3">
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar a página</AlertTitle>
        <AlertDescription>A loja não respondeu. Tente de novo em instantes.</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => reset()}>
            Tentar de novo
          </Button>
        </AlertAction>
      </Alert>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Erro: {error.digest}</p>
      ) : null}
    </div>
  );
}
