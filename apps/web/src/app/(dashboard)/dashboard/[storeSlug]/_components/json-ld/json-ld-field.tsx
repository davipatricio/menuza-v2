"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { JsonLdAnalysis } from "@menuza/shared/seo";
import { formatJsonLd } from "@menuza/shared/seo";
import { Button } from "@/components/ui/button.tsx";
import { FieldError } from "@/components/ui/field.tsx";
import { JSON_LD_CODE_CLASS, JSON_LD_CODE_CSS } from "./json-ld-code.ts";
import type { JsonLdPreviewContext } from "./json-ld-preview.ts";

/**
 * O editor e a prévia carregam por demanda: o pacote de realce só entra na
 * página quando o merchant abre a aba de SEO. Enquanto o pedaço não chega, o
 * campo é um `textarea` comum — o mesmo, com o mesmo id e o mesmo valor.
 */
const JsonLdEditor = dynamic(() => import("./json-ld-editor.tsx"), { ssr: false });

export interface JsonLdFieldProps {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  maxLength: number;
  placeholder: string;
  invalid: boolean;
  describedBy?: string;
  /** A leitura do bloco: sintaxe, avisos e o valor já interpretado. */
  analysis: JsonLdAnalysis;
  /** O modelo pronto do produto, quando a entidade tem um. */
  suggestedJson: string | null;
  context?: JsonLdPreviewContext | null;
}

export function JsonLdField({
  id,
  value,
  onChange,
  onBlur,
  maxLength,
  placeholder,
  invalid,
  describedBy,
  analysis,
  suggestedJson,
}: JsonLdFieldProps) {
  const text = value ?? "";
  const jsonErrorId = `${id}-json-error`;

  /** O campo guarda `null` quando o texto some, como os outros campos do SEO. */
  const handleChange = (next: string) => onChange(next === "" ? null : next);

  const describedByWithError =
    [describedBy, analysis.error === null ? null : jsonErrorId].filter(Boolean).join(" ") ||
    undefined;

  const format = () => {
    if (analysis.error !== null) return;

    onChange(formatJsonLd(text));
  };

  return (
    <div className="flex flex-col gap-2">
      <style>{JSON_LD_CODE_CSS}</style>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={analysis.error !== null || text.trim() === ""}
          onClick={format}
        >
          Formatar
        </Button>

        {suggestedJson ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(suggestedJson)}>
            Usar modelo
          </Button>
        ) : null}
      </div>

      <Suspense
        fallback={
          <PlainTextarea
            id={id}
            value={text}
            onChange={onChange}
            onBlur={onBlur}
            maxLength={maxLength}
            placeholder={placeholder}
            invalid={invalid}
            describedBy={describedByWithError}
          />
        }
      >
        <JsonLdEditor
          id={id}
          value={text}
          onChange={handleChange}
          onBlur={onBlur}
          maxLength={maxLength}
          placeholder={placeholder}
          invalid={invalid}
          describedBy={describedByWithError}
          errorLine={analysis.error?.line ?? null}
        />
      </Suspense>

      {analysis.error ? (
        <FieldError id={jsonErrorId}>
          Linha {analysis.error.line}, coluna {analysis.error.column}: {analysis.error.message}
        </FieldError>
      ) : null}
    </div>
  );
}

/** O campo sem realce, enquanto o pedaço do editor não chega. */
function PlainTextarea({
  id,
  value,
  onChange,
  onBlur,
  maxLength,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  maxLength: number;
  placeholder: string;
  invalid: boolean;
  describedBy?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value || null)}
      onBlur={onBlur}
      maxLength={maxLength}
      placeholder={placeholder}
      spellCheck={false}
      rows={14}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={`block h-72 min-h-[14rem] w-full resize-y overflow-auto rounded-lg border border-input bg-muted/20 p-3 font-mono text-xs leading-5 text-foreground transition-colors outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 ${JSON_LD_CODE_CLASS}`}
    />
  );
}
