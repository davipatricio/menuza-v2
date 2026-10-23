/**
 * Product CSV shape, shared by the server export route. Serialization is
 * browser-safe, so nothing here touches the DOM.
 */
import type { PanelProduct } from "@menuza/shared/tenant";
import { type CsvColumn, serializeCsv } from "@/lib/csv-export.ts";

export const productCsvColumns: Array<CsvColumn<PanelProduct>> = [
  { key: "name", label: "Produto" },
  {
    key: "categoryName",
    label: "Categoria",
    accessor: (product) => product.categoryName ?? "",
  },
  {
    key: "departmentName",
    label: "Departamento",
    accessor: (product) => product.departmentName ?? "",
  },
  {
    key: "tags",
    label: "Tags",
    accessor: (product) => product.tags.map((tag) => tag.name).join(", "),
  },
  {
    key: "priceCents",
    label: "Preço",
    accessor: (product) =>
      product.priceCents === null ? "" : (product.priceCents / 100).toFixed(2),
  },
  {
    key: "available",
    label: "Disponibilidade",
    accessor: (product) => (product.available ? "Disponível" : "Indisponível"),
  },
];

/** BOM keeps Excel on pt-BR locales from mangling the accents. */
export function serializeProductsCsv(rows: PanelProduct[]): string {
  return `\uFEFF${serializeCsv(productCsvColumns, rows)}`;
}
