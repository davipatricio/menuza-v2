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
import type { PanelKitOptionProduct } from "@/lib/api/model/panelKitOptionProduct.ts";
import { kitBandFor, kitUnitCents } from "../lib/kit-price.ts";
import type { KitFormValues } from "../schemas/kit.ts";

export function KitPreview({
  values,
  options,
}: {
  values: KitFormValues;
  options: PanelKitOptionProduct[];
}) {
  const chosenCents = values.items.map((item) => {
    const product = options.find((option) => option.id === item.productId);
    const variation = product?.variations.find((entry) => entry.id === item.variationId);

    return variation?.priceCents ?? 0;
  });

  const price = kitUnitCents({
    pricingMode: values.pricingMode,
    baseCents: values.baseCents,
    percentOff: values.percentOff,
    chosenCents,
  });

  const counts = [1, ...values.bands.map((band) => band.minQuantity)].map((kitCount) => ({
    kitCount,
    band: kitBandFor(values.bands, kitCount),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prévia</CardTitle>
        <CardDescription>
          {values.pricingMode === "fixed"
            ? "Preço fixo do kit, sem somar os pratos."
            : "Soma dos pratos escolhidos, respeitando o piso."}
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
                {counts.map(({ kitCount, band }) => {
                  const total = Math.round(
                    price.totalCents * kitCount * (1 - (band?.percent ?? 0) / 100),
                  );

                  return (
                    <tr key={kitCount} className="border-t border-border">
                      <td className="py-1 pr-4 tabular-nums">{kitCount}</td>
                      <td className="py-1 pr-4 tabular-nums">{band ? `${band.percent}%` : "—"}</td>
                      <td className="py-1 tabular-nums">{formatBrl(total)}</td>
                    </tr>
                  );
                })}
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
