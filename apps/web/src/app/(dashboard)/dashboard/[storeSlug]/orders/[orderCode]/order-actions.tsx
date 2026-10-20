"use client";

/**
 * The transitions the API says are legal, each as one button. A move the shared
 * table flags `requiresReason` opens a dialog with a mandatory pt-BR textarea;
 * everything else fires straight away.
 *
 * "Registrar recebimento" is the only action that is not a plain transition: it
 * goes through `recordOrderPayment`, which credits the cashback, and the panel
 * only offers it while the money is still due on delivery. On any other state the
 * same `paid` move stays available as a normal transition.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import type { FinancialStatus, PanelOrderTransition } from "@menuza/shared/tenant";
import { tenantContractObject } from "@menuza/shared/tenant";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { CardContent, CardFooter } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  FINANCIAL_TRANSITION_LABELS,
  FULFILMENT_TRANSITION_LABELS,
  orderLabel,
} from "@/lib/panel-labels.ts";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client(): ContractClient {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

/**
 * The API's error codes in pt-BR. The raw `ORPCError.message` is developer copy,
 * so an unmapped code falls back to the generic sentence instead of leaking it.
 */
function serverMessage(error: Error): string {
  if (error instanceof ORPCError) {
    if (error.code === "ORDER_TRANSITION_INVALID")
      return "Este pedido já mudou. Recarregue a página para ver o estado atual.";

    if (error.code === "REASON_REQUIRED") return "Informe o motivo da mudança.";

    if (error.code === "FORBIDDEN") return "Você não tem permissão para essa mudança neste pedido.";

    if (error.code === "NOT_FOUND") return "Pedido não encontrado nesta loja.";

    if (error.code === "CONFLICT") return "A carteira do cliente não permitiu concluir a ação.";
  }

  return "Não foi possível concluir a ação. Tente novamente.";
}

/** The button's text: the target state's own name, per axis. */
function transitionLabel(transition: PanelOrderTransition): string {
  return transition.axis === "financial"
    ? orderLabel(FINANCIAL_TRANSITION_LABELS, transition.to)
    : orderLabel(FULFILMENT_TRANSITION_LABELS, transition.to);
}

export function OrderActions({
  storeSlug,
  orderCode,
  financialStatus,
  transitions,
}: {
  storeSlug: string;
  orderCode: string;
  financialStatus: FinancialStatus;
  transitions: PanelOrderTransition[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PanelOrderTransition | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recordPayment = financialStatus === "pending_on_delivery";

  /** `paid` is the payment action only while the money is due on delivery. */
  const isPaymentButton = (transition: PanelOrderTransition) =>
    recordPayment && transition.axis === "financial" && transition.to === "paid";

  /** Fires one axis move; `reason` is only sent for the rules that need it. */
  const applyTransition = async (transition: PanelOrderTransition, why?: string) => {
    const input = {
      storeSlug,
      orderCode,
      axis: transition.axis,
      to: transition.to,
    };

    if (why === undefined) {
      await client().panel.transitionOrder(input);

      return;
    }

    await client().panel.transitionOrder({ ...input, reason: why });
  };

  const applyPayment = async () => {
    await client().panel.recordOrderPayment({ storeSlug, orderCode });
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);

    try {
      await action();
      setPending(null);
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? serverMessage(caught) : serverMessage(new Error()));
    } finally {
      setBusy(null);
    }
  };

  const choose = (transition: PanelOrderTransition) => {
    if (transition.requiresReason) {
      setReason("");
      setPending(transition);

      return;
    }

    void run(isPaymentButton(transition) ? "payment" : `${transition.axis}:${transition.to}`, () =>
      isPaymentButton(transition) ? applyPayment() : applyTransition(transition),
    );
  };

  const confirmWithReason = () => {
    if (!pending) return;

    const key = isPaymentButton(pending) ? "payment" : `${pending.axis}:${pending.to}`;

    void run(key, () =>
      isPaymentButton(pending) ? applyPayment() : applyTransition(pending, reason.trim()),
    );
  };

  return (
    <>
      {error ? (
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Ação não concluída</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}

      <CardFooter>
        {transitions.length ? (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Ações do pedido"
          >
            {transitions.map((transition) => {
              const key = isPaymentButton(transition)
                ? "payment"
                : `${transition.axis}:${transition.to}`;

              return (
                <Button
                  key={key}
                  size="sm"
                  variant={transition.to === "canceled" ? "outline" : "default"}
                  disabled={busy !== null}
                  onClick={() => choose(transition)}
                >
                  {busy === key ? <Spinner data-icon="inline-start" /> : null}
                  {isPaymentButton(transition)
                    ? "Registrar recebimento"
                    : transitionLabel(transition)}
                </Button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma mudança disponível para o seu acesso neste estado.
          </p>
        )}
      </CardFooter>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending ? transitionLabel(pending) : "Confirmar mudança"}</DialogTitle>
            <DialogDescription>
              Esta mudança fica registrada no histórico do pedido.
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={reason.trim() === ""}>
            <FieldLabel htmlFor="order-transition-reason">Motivo</FieldLabel>
            <Textarea
              id="order-transition-reason"
              rows={3}
              maxLength={500}
              value={reason}
              aria-invalid={reason.trim() === ""}
              aria-describedby="order-transition-reason-description"
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription id="order-transition-reason-description">
              Obrigatório. Aparece no histórico do pedido.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy !== null}>
              Cancelar
            </Button>
            <Button disabled={busy !== null || reason.trim() === ""} onClick={confirmWithReason}>
              {busy !== null ? <Spinner data-icon="inline-start" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
