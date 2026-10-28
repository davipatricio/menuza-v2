/**
 * As métricas que a camada editável e a camada realçada precisam ter em comum.
 *
 * O editor é um `<textarea>` transparente por cima de um `<pre>` realçado: se as
 * duas camadas usarem fontes diferentes, o cursor anda na linha errada. Por isso
 * as duas recebem a mesma classe e a mesma regra de fonte.
 */
export const JSON_LD_CODE_CLASS = "json-ld-editor-shared";

export const JSON_LD_CODE_CSS = `
.json-ld-editor-shared {
  margin: 0 !important;
  padding: 0.75rem !important;
  border: 1px solid transparent !important;
  font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 0.75rem !important;
  line-height: 1.25rem !important;
  font-weight: 400 !important;
  font-variant-ligatures: none !important;
  tab-size: 2 !important;
  letter-spacing: 0 !important;
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
  box-sizing: border-box !important;
}

.json-ld-editor-pre code {
  font: inherit !important;
  letter-spacing: inherit !important;
  tab-size: inherit !important;
  line-height: inherit !important;
  white-space: inherit !important;
  word-break: inherit !important;
  overflow-wrap: inherit !important;
}

.json-ld-editor-pre .th-line {
  display: block !important;
  min-width: 0 !important;
  width: auto !important;
  line-height: inherit !important;
}
`;
