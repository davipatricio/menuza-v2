"use client";

import { useCallback, useEffect, useState } from "react";
import { PUSH_EVENTS, type PushEvent } from "@menuza/shared/push";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  type PushState,
  disablePush,
  enablePush,
  isPushSupported,
  loadPushPreferences,
  syncSubscriptionState,
  updatePushPreferences,
} from "@/lib/push-subscription.ts";

const EVENT_LABELS: Record<PushEvent, string> = {
  ORDER_CREATED: "Novo pedido",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PIX_EXPIRED: "Pix expirado",
  ORDER_READY: "Pedido pronto",
  ORDER_CANCELLED: "Cancelamento",
};

export function PushNotificationsCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [events, setEvents] = useState<PushEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await syncSubscriptionState();

      setState(next);

      if (next === "subscribed") {
        setEvents(await loadPushPreferences());
      }
    } catch {
      setMessage("Não foi possível carregar as notificações push.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleToggle = async () => {
    setBusy(true);
    setMessage(null);

    try {
      if (state === "subscribed") {
        await disablePush();
        setEvents([]);
        setMessage("Notificações desativadas neste navegador.");
      } else {
        const result = await enablePush();

        if (!result.ok) {
          const copy =
            result.reason === "denied"
              ? "Permissão negada. Habilite as notificações nas configurações do navegador."
              : "Não foi possível ativar as notificações neste navegador.";

          setMessage(copy);
        } else {
          setMessage("Notificações ativadas neste navegador.");
        }
      }

      await refresh();
    } catch {
      setMessage("Não foi possível atualizar o estado das notificações.");
    } finally {
      setBusy(false);
    }
  };

  const handleEventToggle = async (event: PushEvent, checked: boolean) => {
    setBusy(true);
    setMessage(null);

    const next = checked ? [...events, event] : events.filter((current) => current !== event);

    try {
      await updatePushPreferences(next);
      setEvents(next);
      setMessage("Preferências atualizadas.");
    } catch {
      setMessage("Não foi possível salvar as preferências.");
    } finally {
      setBusy(false);
    }
  };

  const subscribed = state === "subscribed";
  const unsupported = state !== null && !isPushSupported();

  return (
    <Card aria-labelledby="push-notifications-heading">
      <CardHeader>
        <CardTitle id="push-notifications-heading">Notificações push</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Receba avisos dos pedidos em tempo real neste navegador.
        </p>

        {unsupported ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Este navegador não oferece suporte a notificações push. Use um navegador atualizado em
            uma conexão segura (HTTPS).
          </p>
        ) : null}

        {state === "denied" ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            As notificações estão bloqueadas. Habilite-as nas configurações de notificações do
            navegador para este site.
          </p>
        ) : null}

        {!unsupported ? (
          <Button
            onClick={handleToggle}
            disabled={busy}
            variant={subscribed ? "outline" : "default"}
          >
            {subscribed ? "Desativar notificações" : "Ativar notificações"}
          </Button>
        ) : null}

        {subscribed ? (
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-medium">Avisar sobre</legend>
            {PUSH_EVENTS.map((event) => (
              <Label key={event} className="font-normal">
                <input
                  type="checkbox"
                  checked={events.includes(event)}
                  onChange={(changeEvent) => handleEventToggle(event, changeEvent.target.checked)}
                />
                {EVENT_LABELS[event]}
              </Label>
            ))}
          </fieldset>
        ) : null}

        <output className="block text-sm" aria-live="polite">
          {message ?? ""}
        </output>
      </CardContent>
    </Card>
  );
}
