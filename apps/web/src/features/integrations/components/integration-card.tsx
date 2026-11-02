import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { IntegrationDefinition, PanelIntegration } from "@menuza/shared/tenant";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { IntegrationLogoMark } from "@/features/integrations/components/integration-logo.tsx";
import { IntegrationStatusBadge } from "@/features/integrations/components/status-badge.tsx";
import { IntegrationToggle } from "@/features/integrations/components/integration-toggle.tsx";

/**
 * One integration card. The title link stretches over the card with a
 * positioned `::after`, so the switch beside it is not a nested interactive
 * control inside an anchor.
 */
export function IntegrationCard({
  definition,
  storeSlug,
  state,
}: {
  definition: IntegrationDefinition;
  storeSlug: string;
  state: PanelIntegration | null;
}) {
  const status = state?.status ?? "disabled";

  return (
    <Card className="relative flex flex-col justify-between gap-0 transition-colors hover:border-ring/40">
      <CardHeader className="grid-cols-[auto_1fr_auto] items-start gap-3">
        <IntegrationLogoMark integration={definition} />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate text-base">
            <Link
              to="/dashboard/$storeSlug/integrations/$integrationId"
              params={{ storeSlug, integrationId: definition.id }}
              preload="intent"
              className="outline-none after:absolute after:inset-0"
            >
              {definition.name}
            </Link>
          </CardTitle>
          <CardDescription className="line-clamp-2 text-xs">
            {definition.description}
          </CardDescription>
        </div>
        <div className="relative z-10">
          <IntegrationToggle
            storeSlug={storeSlug}
            integrationId={definition.id}
            name={definition.name}
            enabled={status === "enabled"}
          />
        </div>
      </CardHeader>

      <CardContent className="flex items-center justify-between gap-2 pt-3">
        <IntegrationStatusBadge status={status} />
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
