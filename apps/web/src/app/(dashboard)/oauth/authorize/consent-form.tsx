"use client";

import { useState } from "react";
import { Check, ShieldCheck, Store, X } from "lucide-react";
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
import { authorizeOAuth } from "./actions.ts";

export interface StoreOption {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

export interface ConsentFormProps {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  scope?: string;
  stores: StoreOption[];
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

export function ConsentForm({
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  scope,
  stores,
}: ConsentFormProps) {
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

  function handleCancel() {
    try {
      const url = new URL(redirectUri);
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("error_description", "User denied authorization");

      if (state) url.searchParams.set("state", state);
      window.location.href = url.toString();
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
      const result = await authorizeOAuth({
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        state,
        tenantIds: selectedTenantIds,
        scopes: scope ? scope.split(" ") : ["admin"],
      });

      if (!result.ok || !result.redirectUrl) {
        setError(result.error ?? "Erro ao autorizar aplicativo.");
        setPending(false);

        return;
      }

      window.location.href = result.redirectUrl;
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
