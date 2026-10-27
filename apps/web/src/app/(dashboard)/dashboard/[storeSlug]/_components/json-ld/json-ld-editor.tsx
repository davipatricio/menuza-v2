"use client";

import type { KeyboardEvent, UIEvent } from "react";
import { useRef } from "react";
import { highlightThemeCss, highlighter } from "./highlighter.ts";
import { JSON_LD_CODE_CLASS } from "./json-ld-code.ts";

export interface JsonLdEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  maxLength: number;
  placeholder: string;
  invalid: boolean;
  describedBy?: string;
  /** Linha do erro de sintaxe, para o realce marcar a linha. */
  errorLine: number | null;
}

/**
 * O editor de JSON-LD: um `<textarea>` transparente sobre o realce.
 *
 * O TanStack Highlight só desenha, então o texto continua num campo de
 * verdade — com seleção, cópia, leitor de tela e histórico do navegador. A
 * camada realçada é `aria-hidden` e os dois rolam juntos.
 */
export default function JsonLdEditor({
  id,
  value,
  onChange,
  onBlur,
  maxLength,
  placeholder,
  invalid,
  describedBy,
  errorLine,
}: JsonLdEditorProps) {
  const codeRef = useRef<HTMLPreElement>(null);

  const html = highlighter.highlight(value === "" ? " " : value, {
    lang: "json",
    decorations:
      errorLine === null ? undefined : [{ lines: errorLine, className: "th-error-line" }],
  }).html;

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const code = codeRef.current;

    if (!code) return;

    code.scrollTop = event.currentTarget.scrollTop;
    code.scrollLeft = event.currentTarget.scrollLeft;
  };

  /** Tab indenta em vez de sair do campo: são dois espaços, como no JSON. */
  const handleTab = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;

    event.preventDefault();

    const field = event.currentTarget;
    const start = field.selectionStart;
    const end = field.selectionEnd;

    onChange(`${field.value.slice(0, start)}  ${field.value.slice(end)}`);

    requestAnimationFrame(() => {
      field.selectionStart = start + 2;
      field.selectionEnd = start + 2;
    });
  };

  return (
    <>
      <style>{highlightThemeCss}</style>

      <div className="relative rounded-lg bg-background">
        <pre
          ref={codeRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent p-3 ${JSON_LD_CODE_CLASS}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onScroll={syncScroll}
          onKeyDown={handleTab}
          maxLength={maxLength}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          rows={10}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`relative block w-full resize-y rounded-lg border border-input bg-transparent p-3 text-transparent caret-foreground transition-colors outline-none selection:bg-primary/20 placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 ${JSON_LD_CODE_CLASS}`}
        />
      </div>
    </>
  );
}
