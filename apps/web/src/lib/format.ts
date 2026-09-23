/**
 * Formatação de exibição do painel. Única fonte para valores mostrados ao usuário.
 */
export function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
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
