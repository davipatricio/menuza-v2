/**
 * Formatação de exibição do painel. Única fonte para valores mostrados ao usuário.
 *
 * Valores monetários chegam como Int em centavos (ADR-0006) e são convertidos
 * aqui, na borda — o contrato e o banco nunca carregam float.
 */
export function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
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
