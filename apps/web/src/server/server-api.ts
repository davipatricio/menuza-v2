/**
 * Server-side API clients.
 *
 * Each call instantiates a fresh client bound to the validated internal API origin.
 * No client state, cookies, or tenant context is shared across requests.
 *
 * Commerce reads are plain REST paths on the internal origin (`/health`, `/store`,
 * `/menu`, `/products/{productId}`, `/sitemap`). The browser hits the same-origin
 * `/commerce/...` prefix (proxied to the loopback service by `vite.config.ts` in
 * development); the generated fetchers in `src/lib/api/commerce.ts` are browser-side
 * only, so this module calls `${origin}${path}` directly.
 */
import { getRequest } from "@tanstack/react-start/server";
import type {
  ProductResponse,
  PublicMenu,
  PublicKit,
  PublicKitOutput,
  PublicKitsOutput,
  PublicProductDetail,
  PublicSitemap,
  PublicStore,
} from "@/lib/api/model";

interface HealthOk {
  status: "ok";
  service: string;
  timestamp: string;
}

type StorefrontClient = {
  public: {
    getStore(): Promise<PublicStore>;
    listMenu(): Promise<PublicMenu>;
    getProduct(input: { productId: string }): Promise<{
      product: PublicProductDetail | null;
    }>;
    listSitemap(): Promise<PublicSitemap>;
    listKits(): Promise<PublicKitsOutput>;
    getKit(input: { slug: string }): Promise<{ kit: PublicKit | null }>;
  };
};

async function getJson<T>(origin: string, path: string, tenantId?: string): Promise<T> {
  const res = await fetch(`${origin}${path}`, {
    method: "GET",
    headers: tenantId ? { "x-menuza-tenant-id": tenantId } : undefined,
  });

  if (!res.ok) throw new Error(`commerce ${res.status}`);

  // SAFETY: the response body is the OpenAPI schema this path documents; a
  // mismatched shape is a server bug the DTO types cannot catch at runtime.
  return (await res.json()) as T;
}

export async function getCommerceStatus(): Promise<
  { ok: true; data: HealthOk } | { ok: false; error: string }
> {
  try {
    const origin = process.env.COMMERCE_INTERNAL_URL ?? "http://127.0.0.1:3001";
    const data = await getJson<HealthOk>(origin, "/health");

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Public storefront client bound to the tenant the request middleware resolved
 * for this host.
 *
 * The tenant never travels in a request body: `src/start.ts` resolves host →
 * tenantId and writes the server-only `x-menuza-tenant-id` header, which this
 * forwards to the commerce API. `null` means the header was empty, i.e. no
 * store owns this host.
 */
export async function storefrontClient(): Promise<StorefrontClient | null> {
  const tenantId = getRequest().headers.get("x-menuza-tenant-id") ?? "";

  if (!tenantId) return null;

  const origin = process.env.COMMERCE_INTERNAL_URL ?? "http://127.0.0.1:3001";

  return {
    public: {
      getStore: () => getJson<PublicStore>(origin, "/store", tenantId),
      listMenu: () => getJson<PublicMenu>(origin, "/menu", tenantId),
      getProduct: async ({ productId }): Promise<{ product: PublicProductDetail | null }> => {
        const { product } = await getJson<ProductResponse>(
          origin,
          `/products/${productId}`,
          tenantId,
        );

        return { product: product ?? null };
      },
      listSitemap: () => getJson<PublicSitemap>(origin, "/sitemap", tenantId),
      listKits: () => getJson<PublicKitsOutput>(origin, "/kits", tenantId),
      getKit: async ({ slug }): Promise<{ kit: PublicKit | null }> => {
        const { kit } = await getJson<PublicKitOutput>(
          origin,
          `/kits/${encodeURIComponent(slug)}`,
          tenantId,
        );

        return { kit: kit ?? null };
      },
    },
  };
}
