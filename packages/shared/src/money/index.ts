/**
 * Money display shared by the web storefront and the native app.
 *
 * Values are integer cents (ADR-0006) and become a pt-BR string only here, at
 * the edge. The dashboard formatter re-exports this one instead of keeping a
 * second copy, so the same order reads the same in both clients.
 */
export function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
