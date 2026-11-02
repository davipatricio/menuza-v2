import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";

/** Shared failure UI for the catalog route: a read that fails must not blank the shell. */
export function CatalogError({ onRetry }: { onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Não foi possível carregar o catálogo</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>Tente novamente. Se o problema continuar, recarregue a página.</span>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
