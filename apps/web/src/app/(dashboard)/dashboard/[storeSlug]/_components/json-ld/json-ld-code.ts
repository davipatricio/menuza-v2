/**
 * As métricas que a camada editável e a camada realçada precisam ter em comum.
 *
 * O editor é um `<textarea>` transparente por cima de um `<pre>` realçado: se as
 * duas camadas usarem fontes diferentes, o cursor anda na linha errada. Por isso
 * as duas recebem a mesma classe e a mesma regra de fonte.
 */
export const JSON_LD_CODE_CLASS = "json-ld-code font-mono text-xs leading-5";

export const JSON_LD_CODE_CSS = `
.json-ld-code {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.25rem;
  font-weight: 400;
  font-variant-ligatures: none;
  tab-size: 2;
  letter-spacing: normal;
}

.json-ld-code code {
  font: inherit;
  letter-spacing: inherit;
}
`;
