/**
 * Origem absoluta do request atual (server-only).
 *
 * O host nunca vem do cliente nem de uma constante: `src/proxy.ts` resolve o
 * host da requisição, recusa host fora da allowlist e grava `x-menuza-host` +
 * `x-menuza-mode`. Tudo aqui lê esses dois headers, então a mesma loja responde
 * `https://loja-a...` e `https://loja-b...` sem domínio embutido no código.
 */
import { headers } from "next/headers";

// Mesmo CSV `host=mode` do proxy. Repetido porque `proxy.ts` é middleware e não
// pode ser importado por componentes: um módulo só para ler o env seria pior.
const STOREFRONT_HOSTS = new Set(
  (process.env.WEB_HOST_MAP ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((entry) => {
      const [host, mode] = entry.split("=");

      return host && mode === "storefront" ? [host] : [];
    }),
);

/**
 * Protocolo do request: o `x-forwarded-proto` de um proxy confiável quando
 * existe, senão o padrão do ambiente. Sem HTTPS em produção e sem HTTP local.
 */
function protocol(forwarded: string | null): string {
  const first = forwarded?.split(",")[0]?.trim();

  if (first === "https" || first === "http") return first;

  return process.env.NODE_ENV === "production" ? "https" : "http";
}

/** `https://loja.exemplo` do request atual, ou `""` quando o host não foi resolvido. */
export async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-menuza-host") ?? "").trim();

  if (!host) return "";

  return `${protocol(requestHeaders.get("x-forwarded-proto"))}://${host}`;
}

/** URL absoluta para um caminho; relativa quando não há host resolvido. */
export async function absoluteUrl(path: string): Promise<string> {
  const origin = await requestOrigin();

  return origin ? new URL(path, origin).toString() : path;
}

/**
 * O host pode ser indexado? Predicado único de `noindex`: só em produção, e só
 * quando o proxy declarou uma superfície conhecida — um host de loja listado em
 * `WEB_HOST_MAP` ou o domínio principal. Alias, host de desenvolvimento e host
 * não resolvido ficam fora do índice.
 */
export async function isIndexableHost(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return false;

  const requestHeaders = await headers();
  const mode = requestHeaders.get("x-menuza-mode");
  const host = (requestHeaders.get("x-menuza-host") ?? "").toLowerCase();

  if (mode === "storefront") return STOREFRONT_HOSTS.has(host);

  return mode === "main";
}
