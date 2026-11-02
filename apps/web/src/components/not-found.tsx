import { Link } from "@tanstack/react-router";

/**
 * Router-wide 404, wired as `defaultNotFoundComponent` in `src/router.tsx`.
 * Copy mirrors the `apps/web` 404 screens.
 */
export function NotFound() {
  return (
    <main className="grid min-h-svh place-content-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Não encontrado</h1>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">
        O endereço acessado não corresponde a nenhuma página. Confira o link recebido.
      </p>
      <div>
        <Link
          to="/"
          className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
