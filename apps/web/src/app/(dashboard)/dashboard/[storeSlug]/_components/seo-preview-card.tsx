"use client";

import { useMemo, useState } from "react";
import { Globe, Image as ImageIcon } from "lucide-react";
import type { JsonLdAnalysis } from "@menuza/shared/seo";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { formatBrl } from "@/lib/format.ts";
import JsonLdPreview, { type JsonLdPreviewContext } from "./json-ld/json-ld-preview.tsx";

export type SeoPreviewMode = "search" | "social" | "jsonLd";

export interface SeoPreviewCardProps {
  title: string | null;
  description: string | null;
  url: string | null;
  socialImageUrl: string | null;
  analysis: JsonLdAnalysis;
  json: string | null;
  context: JsonLdPreviewContext | null;
}

interface UrlParts {
  domain: string;
  path: string;
}

function parseUrlParts(raw: string | null): UrlParts {
  if (!raw) return { domain: "sualoja.menuza.app", path: "" };

  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const domain = parsed.hostname.replace(/^www\./, "");
    const segments = parsed.pathname.split("/").filter(Boolean);
    const path = segments.length > 0 ? ` › ${segments.join(" › ")}` : "";

    return { domain, path };
  } catch {
    const trimmed = raw.startsWith("/") ? raw.slice(1) : raw;
    const path = trimmed ? ` › ${trimmed.replaceAll("/", " › ")}` : "";

    return { domain: "sualoja.menuza.app", path };
  }
}

function priceText(context: JsonLdPreviewContext | null): string | null {
  if (!context || context.priceCents.length === 0) return null;

  const min = Math.min(...context.priceCents);
  const max = Math.max(...context.priceCents);

  return min === max ? formatBrl(min) : `${formatBrl(min)} – ${formatBrl(max)}`;
}

function isSeoPreviewMode(value: string | undefined): value is SeoPreviewMode {
  return value === "search" || value === "social" || value === "jsonLd";
}

function SearchSnippetPreview({
  domain,
  path,
  title,
  description,
  price,
  available,
}: {
  domain: string;
  path: string;
  title: string;
  description: string | null;
  price: string | null;
  available: boolean | undefined;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted">
          <Globe className="size-2.5 text-foreground" data-icon />
        </span>
        <span className="font-medium text-foreground">{domain}</span>
        <span className="truncate">{path}</span>
      </div>

      <p className="line-clamp-2 text-sm leading-snug font-semibold text-foreground hover:underline">
        {title}
      </p>

      <p className="line-clamp-3 text-xs leading-relaxed text-pretty text-muted-foreground">
        {description ??
          "Sem descrição definida. Os buscadores exibirão um trecho automático do cardápio."}
      </p>

      {price || available !== undefined ? (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          {price ? <span className="font-medium tabular-nums">{price}</span> : null}
          {available !== undefined ? (
            <Badge variant={available ? "secondary" : "outline"}>
              {available ? "Em estoque" : "Esgotado"}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SocialCardPreview({
  domain,
  title,
  description,
  imageUrl,
}: {
  domain: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
}) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {imageUrl && !imageError ? (
        <div className="relative aspect-[1.91/1] w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- external arbitrary user URL */}
          <img
            src={imageUrl}
            alt={title}
            className="size-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground">
          <ImageIcon className="size-6 opacity-40" data-icon />
          <span className="text-xs">{imageError ? "Imagem inacessível" : "Sem imagem social"}</span>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-border p-3">
        <p className="truncate text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {domain}
        </p>
        <p className="line-clamp-1 text-sm leading-snug font-semibold text-foreground">{title}</p>
        <p className="line-clamp-2 text-xs leading-relaxed text-pretty text-muted-foreground">
          {description ?? "Sem descrição para redes sociais."}
        </p>
      </div>
    </div>
  );
}

export function SeoPreviewCard({
  title,
  description,
  url,
  socialImageUrl,
  analysis,
  json,
  context,
}: SeoPreviewCardProps) {
  const [mode, setMode] = useState<SeoPreviewMode>("search");

  const { domain, path } = useMemo(() => parseUrlParts(url), [url]);
  const price = useMemo(() => priceText(context), [context]);
  const displayTitle = title || context?.name || "Sem título";
  const displayDescription = description || context?.description || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prévia</CardTitle>
        <CardDescription>
          Como este item aparece na busca do Google, em compartilhamentos e nos dados estruturados.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Tipo de prévia"
          value={[mode]}
          onValueChange={(next: string[]) => {
            const selected = next[0];

            if (isSeoPreviewMode(selected)) {
              setMode(selected);
            }
          }}
        >
          <ToggleGroupItem value="search">Busca</ToggleGroupItem>
          <ToggleGroupItem value="social">Redes sociais</ToggleGroupItem>
          <ToggleGroupItem value="jsonLd">JSON-LD</ToggleGroupItem>
        </ToggleGroup>

        {mode === "search" ? (
          <SearchSnippetPreview
            domain={domain}
            path={path}
            title={displayTitle}
            description={displayDescription}
            price={price}
            available={context?.available}
          />
        ) : null}

        {mode === "social" ? (
          <SocialCardPreview
            domain={domain}
            title={displayTitle}
            description={displayDescription}
            imageUrl={socialImageUrl}
          />
        ) : null}

        {mode === "jsonLd" ? (
          <JsonLdPreview analysis={analysis} json={json} context={context} />
        ) : null}
      </CardContent>
    </Card>
  );
}
