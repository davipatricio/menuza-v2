"use client";

import { useCallback, useEffect, useState } from "react";
import { PUSH_EVENTS, type PushEvent } from "@menuza/shared/push";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
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

function enableFailureMessage(reason: string): string {
  return reason === "denied"
    ? "Permissão negada. Habilite as notificações nas configurações do navegador."
    : "Não foi possível ativar as notificações neste navegador.";
}

function PushStatusMessages({
  state,
  unsupported,
}: {
  state: PushState | null;
  unsupported: boolean;
}) {
  if (unsupported) {
    return (
      <p className="text-sm text-muted-foreground">
        Este navegador não oferece suporte a notificações push. Use um navegador atualizado em uma
        conexão segura (HTTPS).
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="text-sm text-muted-foreground">
        As notificações estão bloqueadas. Habilite-as nas configurações de notificações do navegador
        para este site.
      </p>
    );
  }

  return null;
}

function PushToggleButton({
  subscribed,
  unsupported,
  busy,
  onToggle,
}: {
  subscribed: boolean;
  unsupported: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  if (unsupported) return null;

  return (
    <Button onClick={onToggle} disabled={busy} variant={subscribed ? "outline" : "default"}>
      {subscribed ? "Desativar notificações" : "Ativar notificações"}
    </Button>
  );
}

function PushEventFieldset({
  events,
  busy,
  onToggle,
}: {
  events: PushEvent[];
  busy: boolean;
  onToggle: (event: PushEvent, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Avisar sobre</legend>
      {PUSH_EVENTS.map((event) => (
        <div key={event} className="flex items-center gap-2">
          <Checkbox
            id={`push-event-${event}`}
            checked={events.includes(event)}
            onCheckedChange={(checked) => onToggle(event, checked === true)}
            disabled={busy}
          />
          <Label htmlFor={`push-event-${event}`} className="font-normal">
            {EVENT_LABELS[event]}
          </Label>
        </div>
      ))}
    </fieldset>
  );
}

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

        setMessage(
          result.ok
            ? "Notificações ativadas neste navegador."
            : enableFailureMessage(result.reason),
        );
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
        <p className="text-sm text-muted-foreground">
          Receba avisos dos pedidos em tempo real neste navegador.
        </p>

        <PushStatusMessages state={state} unsupported={unsupported} />

        <PushToggleButton
          subscribed={subscribed}
          unsupported={unsupported}
          busy={busy}
          onToggle={handleToggle}
        />

        {subscribed ? (
          <PushEventFieldset events={events} busy={busy} onToggle={handleEventToggle} />
        ) : null}

        <output className="block text-sm" aria-live="polite">
          {message ?? ""}
        </output>
      </CardContent>
    </Card>
  );
}
