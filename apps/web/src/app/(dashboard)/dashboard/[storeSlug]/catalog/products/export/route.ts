/**
 * Server-side CSV export of the current products view. Uses the same filters
 * as the page and the server-ordered rows, so the file matches the table.
 */
import { ORPCError } from "@orpc/client";
import { panelClient } from "@/lib/server-tenant.ts";
import { serializeProductsCsv } from "../product-csv.ts";
import { filterProducts } from "../product-filter.ts";
import { loadProductSearchParams } from "../product-search-params.ts";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  const { storeSlug } = await params;
  const filters = loadProductSearchParams(new URL(request.url).searchParams);
  const client = await panelClient();

  if (!client) {
    return new Response("Sessão expirada.", { status: 401 });
  }

  try {
    const { products } = await client.panel.listProducts({
      storeSlug,
      sortBy: filters.sort,
      order: filters.order,
    });

    const rows = filterProducts(products, filters);

    return new Response(serializeProductsCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="produtos-${storeSlug}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      return new Response("Loja não encontrada.", { status: 404 });
    }

    if (error instanceof ORPCError && error.code === "FORBIDDEN") {
      return new Response("Sem permissão para exportar os produtos.", { status: 403 });
    }

    return new Response("Não foi possível exportar os produtos.", { status: 500 });
  }
}
