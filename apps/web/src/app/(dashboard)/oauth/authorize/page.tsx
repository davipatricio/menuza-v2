import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Store } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import { getPanelSession } from "@/lib/server-tenant.ts";
import { isRegisteredRedirect } from "./actions.ts";
import { ConsentForm } from "./consent-form.tsx";

export const instant = false;

export const metadata: Metadata = {
  title: "Autorização OAuth — Menuza",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getParam(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];

  return val;
}

export default async function OAuthAuthorizePage(props: PageProps) {
  const searchParams = await props.searchParams;

  const clientId = getParam(searchParams.client_id) ?? getParam(searchParams.clientId);
  const redirectUri = getParam(searchParams.redirect_uri) ?? getParam(searchParams.redirectUri);
  const responseType = getParam(searchParams.response_type) ?? getParam(searchParams.responseType);

  const codeChallenge =
    getParam(searchParams.code_challenge) ?? getParam(searchParams.codeChallenge);

  const codeChallengeMethod =
    getParam(searchParams.code_challenge_method) ??
    getParam(searchParams.codeChallengeMethod) ??
    "S256";

  const state = getParam(searchParams.state);
  const scope = getParam(searchParams.scope);

  const session = await getPanelSession();

  // Redirect to login if not authenticated
  if (!session) {
    const params = new URLSearchParams();

    if (clientId) params.set("client_id", clientId);

    if (redirectUri) params.set("redirect_uri", redirectUri);

    if (responseType) params.set("response_type", responseType);

    if (codeChallenge) params.set("code_challenge", codeChallenge);

    if (codeChallengeMethod) params.set("code_challenge_method", codeChallengeMethod);

    if (state) params.set("state", state);

    if (scope) params.set("scope", scope);

    const returnTo = `/oauth/authorize?${params.toString()}`;
    redirect(`/dashboard/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  // Validate OAuth 2.1 authorization parameters
  let validationError: string | null = null;

  if (!clientId) {
    validationError = "Parâmetro 'client_id' ausente.";
  } else if (!redirectUri) {
    validationError = "Parâmetro 'redirect_uri' ausente.";
  } else if (!responseType || responseType !== "code") {
    validationError = "Parâmetro 'response_type' deve ser 'code'.";
  } else if (!codeChallenge) {
    validationError = "Parâmetro 'code_challenge' ausente (PKCE obrigatório).";
  } else if (codeChallengeMethod !== "S256") {
    validationError = "Parâmetro 'code_challenge_method' deve ser 'S256'.";
  } else if (!(await isRegisteredRedirect(clientId, redirectUri))) {
    // The consent screen is the one place a URI from the query string is acted
    // on — Cancel navigates to it. An unregistered pair is refused here so the
    // page never renders a form whose Cancel button is an open redirect.
    validationError = "Cliente ou 'redirect_uri' não registrado.";
  }

  const stores = session.memberships.map((m) => ({
    tenantId: m.tenantId,
    tenantSlug: m.tenantSlug,
    tenantName: m.tenantName,
  }));

  const isInvalid = Boolean(validationError) || !clientId || !redirectUri || !codeChallenge;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 rounded-lg text-sm font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Store className="size-3.5" />
          </span>
          Menuza
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        {isInvalid ? (
          <Card className="w-full max-w-md border border-destructive/20 bg-destructive/5 text-destructive shadow-surface">
            <CardHeader className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-5" />
                <CardTitle className="text-lg">Requisição Inválida</CardTitle>
              </div>
              <CardDescription className="text-sm text-destructive/80">
                A solicitação de autorização OAuth contém parâmetros inválidos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{validationError ?? "Parâmetros inválidos."}</p>
            </CardContent>
          </Card>
        ) : stores.length === 0 ? (
          <Card className="w-full max-w-md border border-border shadow-surface">
            <CardHeader className="flex flex-col gap-1.5">
              <CardTitle className="text-lg">Nenhuma loja encontrada</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Sua conta não possui lojas vinculadas para conceder acesso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Crie uma loja ou solicite um convite antes de autorizar aplicativos externos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ConsentForm
            clientId={clientId}
            redirectUri={redirectUri}
            codeChallenge={codeChallenge}
            codeChallengeMethod={codeChallengeMethod}
            state={state}
            scope={scope}
            stores={stores}
          />
        )}
      </main>
    </div>
  );
}
