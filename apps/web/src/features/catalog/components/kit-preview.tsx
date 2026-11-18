/**
 * A prévia do que o comprador vê: o preço que sai da composição atual, as
 * faixas progressivas e o resumo dos limites. Serve para o lojista conferir a
 * conta antes de salvar, com a mesma função pura que o checkout usa.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { formatBrl } from "@/lib/format.ts";
import type { PanelKitOptionProduct } from "@menuza/api-client/model/panelKitOptionProduct";
import { kitOrderCents, kitUnitCents } from "../lib/kit-price.ts";
import type { KitFormValues } from "../schemas/kit.ts";

export function KitPreview({
  values,
  options,
}: {
  values: KitFormValues;
  options: PanelKitOptionProduct[];
}) {
  const extraCents = values.items.reduce((total, item) => {
    if (!item.chargeExtra) return total;
    const product = options.find((option) => option.id === item.productId);
    const variation = product?.variations.find((entry) => entry.id === item.variationId);

    return total + (variation?.priceCents ?? 0);
  }, 0);

  const price = kitUnitCents({
    baseCents: values.baseCents,
    percentOff: values.percentOff,
    extraCents,
  });

  const counts = [1, ...values.bands.map((band) => band.minQuantity)].map((kitCount) => ({
    kitCount,
    ...kitOrderCents({ unitCents: price.totalCents, kitCount, bands: values.bands }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prévia</CardTitle>
        <CardDescription>
          {extraCents > 0
            ? "Preço base somado aos adicionais dos pratos com valor extra."
            : "Preço base do kit (sem adicionais extras)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div className="flex flex-col">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatBrl(price.subtotalCents)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-muted-foreground">Desconto do kit</dt>
            <dd className="tabular-nums">-{formatBrl(price.discountCents)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-muted-foreground">Preço do kit</dt>
            <dd className="font-medium tabular-nums">{formatBrl(price.totalCents)}</dd>
          </div>
        </dl>

        {values.bands.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem faixas progressivas: o preço não muda pela quantidade de kits.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Total por quantidade de kits no pedido</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-1 pr-4 font-medium">
                    Kits no pedido
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    Desconto
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {counts.map(({ kitCount, band, totalCents }) => (
                  <tr key={kitCount} className="border-t border-border">
                    <td className="py-1 pr-4 tabular-nums">{kitCount}</td>
                    <td className="py-1 pr-4 tabular-nums">{band ? `${band.percent}%` : "—"}</td>
                    <td className="py-1 tabular-nums">{formatBrl(totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {values.items.length} {values.items.length === 1 ? "prato" : "pratos"} ·{" "}
          {values.groups.length} {values.groups.length === 1 ? "grupo" : "grupos"} · mínimo{" "}
          {values.minItems ?? 0} · máximo {values.maxItems ?? "livre"}
        </p>
      </CardContent>
    </Card>
  );
}
