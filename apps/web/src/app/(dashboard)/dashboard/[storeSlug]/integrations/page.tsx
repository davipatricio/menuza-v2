import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  INTEGRATIONS,
  INTEGRATION_SECTION_LABELS,
  type IntegrationDefinition,
  type IntegrationSection,
  type PanelIntegration,
} from "@menuza/shared/tenant";
import { panelClient } from "@/lib/server-tenant.ts";
import { requireStore } from "../settings/_components/require-store.ts";
import { SettingsSection } from "../settings/_components/settings-section.tsx";
import { IntegrationStatusBadge } from "./_components/status-badge.tsx";
import { IntegrationToggle } from "./_components/integration-toggle.tsx";
import { IntegrationLogoMark } from "./_components/integration-logo.tsx";

export const metadata: Metadata = {
  title: "Integrações",
};

/** Render order of the sections; the catalog's own order does not decide it. */
const SECTION_ORDER: IntegrationSection[] = ["connections", "scripts", "payments"];

/**
 * The integrations list: one section per catalog group, one card per
 * integration. The catalog drives the cards (so a newly shipped integration
 * appears without a backfill) and `panel.listIntegrations` supplies each one's
 * per-store state.
 */
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await requireStore(storeSlug);
  const client = await panelClient();

  const state = client ? await client.panel.listIntegrations({ storeSlug }) : { integrations: [] };

  const byId = new Map<string, PanelIntegration>(
    state.integrations.map((integration) => [integration.integrationId, integration]),
  );

  return (
    <SettingsSection
      headingId="integrations-heading"
      title="Integrações"
      description={`Conecte ${store.displayName} a ferramentas externas: scripts de análise, conexões e pagamentos.`}
    >
      <div className="flex flex-col gap-8">
        {SECTION_ORDER.map((section) => {
          const definitions = INTEGRATIONS.filter((definition) => definition.section === section);

          if (definitions.length === 0) return null;

          return (
            <section key={section} aria-label={INTEGRATION_SECTION_LABELS[section]}>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                {INTEGRATION_SECTION_LABELS[section]}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {definitions.map((definition) => (
                  <IntegrationCard
                    key={definition.id}
                    definition={definition}
                    storeSlug={storeSlug}
                    state={byId.get(definition.id) ?? null}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function IntegrationCard({
  definition,
  storeSlug,
  state,
}: {
  definition: IntegrationDefinition;
  storeSlug: string;
  state: PanelIntegration | null;
}) {
  const status = state?.status ?? "disabled";
  const enabled = status === "enabled";
  const href = `/dashboard/${storeSlug}/integrations/${definition.id}`;

  return (
    <Card className="relative flex flex-col justify-between gap-0 transition-colors hover:border-ring/40">
      <CardHeader className="grid-cols-[auto_1fr_auto] items-start gap-3">
        <IntegrationLogoMark integration={definition} />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate text-base">
            {/* The whole card is the link target; this anchor carries the name
                so the switch beside it is not a nested interactive control. */}
            <Link href={href} className="outline-none after:absolute after:inset-0">
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
            enabled={enabled}
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
