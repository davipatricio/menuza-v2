"use client";

import { useMemo } from "react";
import type { JsonLdAnalysis, JsonLdNode, JsonLdOffer } from "@menuza/shared/seo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { formatBrl } from "@/lib/format.ts";
import { highlightThemeCss, highlighter } from "./highlighter.ts";
import { JSON_LD_CODE_CLASS } from "./json-ld-code.ts";

/** O que a prévia sabe do produto quando o JSON-LD não traz o dado. */
export interface JsonLdPreviewContext {
  name: string;
  description: string | null;
  /** Caminho ou URL canônica da página. */
  url: string;
  /** O item está à venda? */
  available: boolean;
  priceCents: number[];
}

export interface JsonLdPreviewProps {
  analysis: JsonLdAnalysis;
  /** O JSON que a página publica: o override da loja ou o modelo gerado. */
  json: string | null;
  context: JsonLdPreviewContext | null;
}

/**
 * A prévia do JSON-LD: o que a busca mostra quando o bloco é publicado.
 *
 * A leitura é do bloco que o merchant está escrevendo, não de um modelo
 * paralelo — por isso o mesmo texto alimenta o cartão e o "JSON efetivo".
 */
export default function JsonLdPreview({ analysis, json, context }: JsonLdPreviewProps) {
  const node = analysis.document?.nodes[0] ?? null;

  const html = useMemo(
    () => (json === null ? "" : highlighter.highlight(json, { lang: "json" }).html),
    [json],
  );

  if (analysis.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Corrija o JSON para ver a prévia</AlertTitle>
        <AlertDescription>
          Linha {analysis.error.line}, coluna {analysis.error.column}: {analysis.error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const warnings = analysis.issues.filter((issue) => issue.severity === "warning");

  const type = node ? typeLabel(node) : null;
  const name = (node ? node.name : undefined) ?? context?.name ?? null;
  const description = (node ? node.description : undefined) ?? context?.description ?? null;
  const url = (node ? node.url : undefined) ?? context?.url ?? null;
  const price = priceLabel(node, context);
  const availability = node ? availabilityLabel(node) : null;

  return (
    <div className="flex flex-col gap-3">
      <style>{highlightThemeCss}</style>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Prévia na busca</p>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          {url ? <p className="truncate text-xs text-muted-foreground">{url}</p> : null}

          <p className="text-sm font-medium text-foreground">{name ?? "Sem nome"}</p>

          {description ? (
            <p className="text-sm text-pretty text-muted-foreground">{description}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {price ? <span className="text-sm font-medium tabular-nums">{price}</span> : null}
            {availability ? <Badge variant="secondary">{availability}</Badge> : null}
            {type ? <Badge variant="outline">{type}</Badge> : null}
          </div>
        </div>
      </div>

      {warnings.length > 0 ? (
        <Alert>
          <AlertTitle>Revise o JSON-LD</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {warnings.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {json === null ? (
        <p className="text-sm text-muted-foreground">
          Sem JSON-LD: a página publica o bloco gerado a partir dos dados do produto.
        </p>
      ) : (
        <Collapsible>
          <CollapsibleTrigger className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Ver o JSON efetivo
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              className={`mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 ${JSON_LD_CODE_CLASS}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function typeLabel(node: JsonLdNode): string | null {
  const type = node["@type"];

  if (type === undefined) return null;

  return Array.isArray(type) ? (type[0] ?? null) : type;
}

function firstOffer(node: JsonLdNode | null): JsonLdOffer | null {
  const offers = node?.offers;

  if (offers === undefined) return null;

  return Array.isArray(offers) ? (offers[0] ?? null) : offers;
}

/** O JSON-LD traz o preço em decimal; o painel só aceita centavos (ADR-0006). */
function toCents(value: string): number | null {
  const parsed = Number(value.replace(",", "."));

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function priceLabel(node: JsonLdNode | null, context: JsonLdPreviewContext | null): string | null {
  const offer = firstOffer(node);

  const low = offer?.lowPrice;
  const high = offer?.highPrice;
  const single = offer?.price;

  if (low !== undefined && high !== undefined) {
    const from = toCents(low);
    const to = toCents(high);

    if (from === null || to === null) return `${low} – ${high}`;

    return from === to ? formatBrl(from) : `${formatBrl(from)} – ${formatBrl(to)}`;
  }

  if (single !== undefined) {
    const cents = toCents(single);

    return cents === null ? single : formatBrl(cents);
  }

  if (context && context.priceCents.length > 0) {
    const from = Math.min(...context.priceCents);
    const to = Math.max(...context.priceCents);

    return from === to ? formatBrl(from) : `${formatBrl(from)} – ${formatBrl(to)}`;
  }

  return null;
}

function availabilityLabel(node: JsonLdNode): string | null {
  const availability = firstOffer(node)?.availability;

  if (availability === undefined) return null;

  if (availability.endsWith("/InStock")) return "Em estoque";

  if (availability.endsWith("/OutOfStock")) return "Esgotado";

  return availability;
}
