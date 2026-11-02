/**
 * Server-side CSV export of the current products view. Uses the same filters as
 * the list page and the server-ordered rows, so the file matches the table.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ORPCError } from "@orpc/client";
import { serializeProductsCsv } from "@/features/catalog/lib/product-csv.ts";
import { filterProducts } from "@/features/catalog/lib/product-filter.ts";
import { loadProductSearchParams } from "@/features/catalog/schemas/product-search.ts";
import { panelClient } from "@/server/panel-client.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/products/export")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { storeSlug } = params;
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
      },
    },
  },
});
