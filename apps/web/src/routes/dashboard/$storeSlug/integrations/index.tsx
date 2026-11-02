import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  INTEGRATIONS,
  INTEGRATION_SECTION_LABELS,
  type IntegrationSection,
  type PanelIntegration,
} from "@menuza/shared/tenant";
import { IntegrationCard } from "@/features/integrations/components/integration-card.tsx";
import { loadIntegrationsFn } from "@/features/integrations/server/integrations.functions.ts";
import { SettingsSection } from "@/features/settings/components/settings-section.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

/** Render order of the sections; the catalog's own order does not decide it. */
const SECTION_ORDER: IntegrationSection[] = ["connections", "scripts", "payments"];

export const Route = createFileRoute("/dashboard/$storeSlug/integrations/")({
  loader: async ({ params }) => {
    const result = await loadIntegrationsFn({ data: { storeSlug: params.storeSlug } });

    if (result.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    return { integrations: result.integrations };
  },
  head: () => ({ meta: [{ title: pageTitle("Integrações") }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { storeSlug } = Route.useParams();
  const { integrations } = Route.useLoaderData();

  const byId = new Map<string, PanelIntegration>(
    integrations.map((integration) => [integration.integrationId, integration]),
  );

  return (
    <SettingsSection
      headingId="integrations-heading"
      title="Integrações"
      description="Conecte a loja a ferramentas externas: scripts de análise, conexões e pagamentos."
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
