import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";

export default function StorefrontNotFound() {
  return (
    <section aria-labelledby="storefront-not-found-heading" className="flex flex-col gap-4">
      <h1 id="storefront-not-found-heading" className="text-2xl font-semibold tracking-tight">
        Loja não encontrada
      </h1>
      <Alert variant="destructive">
        <AlertTitle>Endereço sem loja ativa</AlertTitle>
        <AlertDescription>
          O endereço acessado não corresponde a nenhuma loja ativa. Confira o link recebido.
        </AlertDescription>
      </Alert>
    </section>
  );
}
