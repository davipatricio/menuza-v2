/**
 * Server-side CSV export of the current products view. Uses the same filter and
 * sort helpers as the page, so the file matches what the table shows.
 */
import { ORPCError } from "@orpc/client";
import { panelClient } from "@/lib/server-tenant.ts";
import { serializeProductsCsv } from "../product-csv.ts";
import { filterProducts, sortProducts } from "../product-filter.ts";
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
    const { products } = await client.panel.listProducts({ storeSlug });
    const rows = filterProducts(sortProducts(products), filters);

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
