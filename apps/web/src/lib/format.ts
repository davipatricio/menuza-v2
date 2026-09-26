/**
 * Formatação de exibição do painel. Única fonte para valores mostrados ao usuário.
 *
 * Valores monetários chegam como Int em centavos (ADR-0006) e são convertidos
 * aqui, na borda — o contrato e o banco nunca carregam float.
 */
export function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/**
 * Data e hora no formato curto pt-BR, a partir do ISO-8601 com `Z` que o
 * contrato entrega. Fica aqui, junto do `formatBrl`, porque é o mesmo tipo de
 * conversão de borda: o valor cru nunca chega à tela.
 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Primeiras letras de cada palavra, no máximo duas, em maiúsculas. */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
