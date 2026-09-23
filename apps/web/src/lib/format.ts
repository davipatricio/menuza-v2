/**
 * Formatação monetária pt-BR (BRL). Única fonte para valores exibidos no painel.
 */
export function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
