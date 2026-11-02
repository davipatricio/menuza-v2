import { Badge } from "@/components/ui/badge.tsx";
import { INTEGRATION_STATUS_LABELS, type IntegrationStatus } from "@menuza/shared/tenant";

/** The one place a stored integration status becomes a pt-BR pill. */
const TONE: Record<IntegrationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  enabled: "default",
  disabled: "outline",
  paused: "secondary",
  error: "destructive",
};

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <Badge variant={TONE[status]} aria-label={`Situação: ${INTEGRATION_STATUS_LABELS[status]}`}>
      {INTEGRATION_STATUS_LABELS[status]}
    </Badge>
  );
}
