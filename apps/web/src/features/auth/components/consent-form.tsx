import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Check, ShieldCheck, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { authorizeFn } from "@/features/auth/server/authorize.ts";

export interface StoreOption {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

export interface ConsentSession {
  memberships: readonly StoreOption[];
}

export interface ConsentSearch {
  clientId?: string;
  redirectUri?: string;
  responseType?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  state?: string;
}

export interface ConsentScreenProps {
  session: ConsentSession;
  search: ConsentSearch;
  registered: boolean;
}

export interface ConsentFormProps {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  session: ConsentSession;
}

const PERMISSIONS = [
  {
    title: "Gestão Completa de Pedidos",
    description: "Visualizar, atualizar status e cancelar pedidos (orders:read, orders:write).",
  },
  {
    title: "Catálogo e Estoque",
    description: "Visualizar e gerenciar categorias, produtos e variações (catalog:write).",
  },
  {
    title: "Configurações da Loja e Formas de Pagamento",
    description:
      "Visualizar e configurar métodos de pagamento e integrações (payments:read, payments:write).",
  },
  {
    title: "Painel e Clientes",
    description: "Consultar métricas de vendas e histórico de clientes (dashboard:read).",
  },
];

/**
 * OAuth 2.1 authorization-parameter check. An unregistered pair is refused here
 * because the consent screen is the one place a URI from the query string is
 * acted on — Cancel navigates to it — so the screen must never render a form
 * whose Cancel button is an open redirect.
 */
function validateConsent(search: ConsentSearch, registered: boolean): string | null {
  const { clientId, redirectUri, responseType, codeChallenge } = search;

  const codeChallengeMethod = search.codeChallengeMethod ?? "S256";

  if (!clientId) return "Parâmetro 'client_id' ausente.";

  if (!redirectUri) return "Parâmetro 'redirect_uri' ausente.";

  if (!responseType || responseType !== "code") return "Parâmetro 'response_type' deve ser 'code'.";

  if (!codeChallenge) return "Parâmetro 'code_challenge' ausente (PKCE obrigatório).";

  if (codeChallengeMethod !== "S256") return "Parâmetro 'code_challenge_method' deve ser 'S256'.";

  if (!registered) return "Cliente ou 'redirect_uri' não registrado.";

  return null;
}

/**
 * Consent screen body. The route owns the page header and the session guard;
 * this renders the three states the Next page painted: an invalid request, an
 * account with no stores to grant, and the consent form itself.
 */
export function ConsentScreen({ session, search, registered }: ConsentScreenProps) {
  const { clientId, redirectUri, codeChallenge, state } = search;

  const codeChallengeMethod = search.codeChallengeMethod ?? "S256";

  const validationError = validateConsent(search, registered);

  const isInvalid = Boolean(validationError) || !clientId || !redirectUri || !codeChallenge;

  if (isInvalid) {
    return (
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
    );
  }

  if (session.memberships.length === 0) {
    return (
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
    );
  }

  return (
    <ConsentForm
      clientId={clientId}
      redirectUri={redirectUri}
      codeChallenge={codeChallenge}
      codeChallengeMethod={codeChallengeMethod}
      state={state}
      session={session}
    />
  );
}

export function ConsentForm({
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  session,
}: ConsentFormProps) {
  const authorize = useServerFn(authorizeFn);

  const stores = session.memberships;

  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>(
    stores.map((s) => s.tenantId),
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStore(tenantId: string) {
    setSelectedTenantIds((prev) =>
      prev.includes(tenantId) ? prev.filter((id) => id !== tenantId) : [...prev, tenantId],
    );
  }

  /**
   * Cancelling must never be the thing that leaks the user off-site: the URI is
   * only navigated to when the server already confirmed the client registered
   * it (the screen refuses to render this form otherwise), and the scheme is
   * re-checked here so a `javascript:` value can never reach `location`.
   */
  function handleCancel() {
    try {
      const url = new URL(redirectUri);

      if (url.protocol !== "https:" && url.protocol !== "http:") {
        setError("URI de redirecionamento inválida.");

        return;
      }

      url.searchParams.set("error", "access_denied");
      url.searchParams.set("error_description", "User denied authorization");

      if (state) url.searchParams.set("state", state);
      window.location.assign(url.toString());
    } catch {
      setError("URI de redirecionamento inválida.");
    }
  }

  async function handleAuthorize() {
    if (selectedTenantIds.length === 0) {
      setError("Selecione pelo menos uma loja para conceder acesso.");

      return;
    }

    setError(null);
    setPending(true);

    try {
      // The consent grant carries the admin scope set; `authorizeFn` defaults to
      // the same list server-side.
      const result = await authorize({
        data: {
          clientId,
          redirectUri,
          codeChallenge,
          codeChallengeMethod,
          tenantIds: selectedTenantIds,
          scopes: ["admin"],
          state,
        },
      });

      if (!result.ok) {
        setError(result.error);
        setPending(false);

        return;
      }

      window.location.assign(result.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-lg border border-border shadow-surface">
      <CardHeader className="flex flex-col gap-1.5 pb-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ShieldCheck className="size-4" />
          <span>Solicitação de Autorização OAuth</span>
        </div>
        <CardTitle className="text-xl font-semibold tracking-tight">Autorizar aplicativo</CardTitle>
        <CardDescription className="text-sm text-pretty text-muted-foreground">
          O aplicativo <strong className="text-foreground">{clientId}</strong> está solicitando
          acesso à sua conta Menuza.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* Store Selection */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Lojas acessíveis ({selectedTenantIds.length}/{stores.length})
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Escolha em quais lojas o aplicativo poderá operar:
          </p>
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-lg border border-border/80 bg-muted/20 p-3">
            {stores.map((store) => {
              const checked = selectedTenantIds.includes(store.tenantId);
              const elementId = `store-${store.tenantId}`;

              return (
                <Field
                  key={store.tenantId}
                  orientation="horizontal"
                  className="items-center justify-between gap-3 py-1"
                >
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id={elementId}
                      checked={checked}
                      onCheckedChange={() => toggleStore(store.tenantId)}
                    />
                    <FieldLabel htmlFor={elementId} className="cursor-pointer text-sm font-medium">
                      <div className="flex flex-col">
                        <span>{store.tenantName}</span>
                        <span className="text-xs text-muted-foreground">/{store.tenantSlug}</span>
                      </div>
                    </FieldLabel>
                  </div>
                  <Store className="size-4 shrink-0 text-muted-foreground" />
                </Field>
              );
            })}
          </div>
        </div>

        {/* Permissions list */}
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-foreground">Permissões solicitadas</span>
          <div className="divide-y divide-border/60 rounded-lg border border-border/80 bg-muted/10 text-xs">
            {PERMISSIONS.map((perm) => (
              <div key={perm.title} className="flex items-start gap-2.5 p-3">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{perm.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{perm.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={handleCancel}
          className="gap-1.5"
        >
          <X className="size-3.5" />
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={pending || selectedTenantIds.length === 0}
          onClick={handleAuthorize}
          className="gap-1.5"
        >
          <Check className="size-3.5" />
          {pending ? "Autorizando..." : "Autorizar"}
        </Button>
      </CardFooter>
    </Card>
  );
}
