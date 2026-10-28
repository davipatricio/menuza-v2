"use client";

import type { KeyboardEvent, UIEvent } from "react";
import { useMemo, useRef } from "react";
import { highlightThemeCss, highlighter } from "./highlighter.ts";
import { JSON_LD_CODE_CLASS, JSON_LD_CODE_CSS } from "./json-ld-code.ts";

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

function extractHighlightedCode(html: string): string {
  const match = html.match(/<code[^>]*>([\s\S]*)<\/code>/);

  return match ? (match[1] ?? "") : html;
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const highlightedHtml = useMemo(() => {
    if (value === "") return "";

    const raw = highlighter.highlight(value, {
      lang: "json",
      decorations:
        errorLine === null ? undefined : [{ lines: errorLine, className: "th-error-line" }],
    }).html;

    const code = extractHighlightedCode(raw);

    return value.endsWith("\n") ? `${code} ` : code;
  }, [value, errorLine]);

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

      if (codeRef.current) {
        codeRef.current.scrollTop = field.scrollTop;
        codeRef.current.scrollLeft = field.scrollLeft;
      }
    });
  };

  return (
    <>
      <style>{highlightThemeCss}</style>
      <style>{JSON_LD_CODE_CSS}</style>

      <div
        className={`relative h-72 max-h-[40rem] min-h-[14rem] w-full resize-y overflow-hidden rounded-lg border bg-muted/20 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 ${
          invalid
            ? "border-destructive focus-within:border-destructive focus-within:ring-destructive/20"
            : "border-input"
        }`}
      >
        <pre
          ref={codeRef}
          aria-hidden="true"
          className={`json-ld-editor-pre pointer-events-none absolute inset-0 overflow-hidden bg-transparent text-foreground ${JSON_LD_CODE_CLASS}`}
        >
          <code
            className="font-inherit block w-full"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>

        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);

            if (codeRef.current) {
              codeRef.current.scrollTop = event.target.scrollTop;
              codeRef.current.scrollLeft = event.target.scrollLeft;
            }
          }}
          onBlur={onBlur}
          onScroll={syncScroll}
          onKeyDown={handleTab}
          maxLength={maxLength}
          placeholder={placeholder}
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`absolute inset-0 size-full resize-none overflow-auto bg-transparent text-transparent caret-foreground outline-none selection:bg-primary/25 placeholder:text-muted-foreground/70 ${JSON_LD_CODE_CLASS}`}
        />
      </div>
    </>
  );
}
