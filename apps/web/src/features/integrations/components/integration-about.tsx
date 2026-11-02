import type { IntegrationDefinition } from "@menuza/shared/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

/** What the integration is: description, catalog screenshots and authorship. */
export function IntegrationAbout({ definition }: { definition: IntegrationDefinition }) {
  const screenshots = definition.screenshots ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sobre</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-pretty text-muted-foreground">{definition.description}</p>
        {screenshots.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {screenshots.map((src) => (
              <li key={src}>
                {/* eslint-disable-next-line nextjs/no-img-element -- catalog asset in a non-Next app */}
                <img
                  src={src}
                  alt={`Captura de tela de ${definition.name}`}
                  width={640}
                  height={400}
                  className="h-auto w-full rounded-lg border border-border"
                />
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Autor: {definition.author} · Integração do catálogo Menuza
        </p>
      </CardContent>
    </Card>
  );
}
