import { createHighlighter } from "@tanstack/highlight/core";
import { json } from "@tanstack/highlight/languages/json";
import { createThemeCss } from "@tanstack/highlight/theme";
import { githubDarkTheme } from "@tanstack/highlight/themes/github-dark";
import { githubLightTheme } from "@tanstack/highlight/themes/github-light";

/**
 * O realce do JSON-LD (chunk sob demanda).
 *
 * O TanStack Highlight só desenha: ele devolve HTML já escapado e pronto para
 * entrar na página. A camada editável é um `<textarea>` transparente por cima
 * deste `<pre>`, então as duas camadas precisam das mesmas métricas de fonte —
 * é o `json-ld-code` que garante isso.
 *
 * A paleta é a do GitHub, a mesma dos blocos de código do app; só o fundo
 * muda, para o realce ficar sobre a superfície do painel.
 */
export const highlighter = createHighlighter({ languages: [json] });

export const highlightThemeCss = `${createThemeCss({
  light: githubLightTheme,
  dark: githubDarkTheme,
  darkSelector: ".dark",
})}
pre.th-code {
  padding: 0;
  background: transparent;
  color: inherit;
  overflow: hidden;
}

pre.th-code .th-line {
  display: block;
  min-width: 0;
  width: auto;
}

.th-error-line {
  background: color-mix(in oklab, var(--destructive) 16%, transparent);
}
`;
