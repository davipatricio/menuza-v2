/**
 * Service Worker runtime caching rules and cache lifecycle.
 * Pure logic module for testability and SW consumption.
 */
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  type RuntimeCaching,
} from "serwist";

export const CACHE_PREFIX = "menuza";

export const CACHE_VERSION = process.env.NEXT_PUBLIC_BUILD_REVISION ?? "v1";

export const CACHE_NAMES = {
  static: `${CACHE_PREFIX}-static-${CACHE_VERSION}`,
  images: `${CACHE_PREFIX}-images-${CACHE_VERSION}`,
  storefront: `${CACHE_PREFIX}-storefront-${CACHE_VERSION}`,
} as const;

export const LEGACY_CACHE_NAMES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
  "apis",
  "default-cache",
];

export interface RouteMatchContext {
  url: URL;
  request: Request;
}

export function isStaticAssetRequest({ url, request }: RouteMatchContext): boolean {
  if (request.method !== "GET") return false;

  const p = url.pathname;

  return p.startsWith("/_next/static/") || p === "/favicon.ico" || p === "/manifest.webmanifest";
}

export function isPublicImageRequest({ url, request }: RouteMatchContext): boolean {
  if (request.method !== "GET") return false;

  const p = url.pathname;

  // Never cache images from private/admin sections
  if (p.startsWith("/manage/") || p.startsWith("/admin/")) return false;

  if (p.startsWith("/_next/image")) return true;

  if (request.destination === "image") return true;

  return /\.(?:png|jpg|jpeg|svg|webp|avif|gif|ico)$/i.test(p);
}

export function isStorefrontDocumentRequest({ url, request }: RouteMatchContext): boolean {
  if (request.method !== "GET") return false;

  if (request.mode !== "navigate" && request.destination !== "document") return false;

  // Exclude RSC / Server Action / data fetches that request documents or headers
  const accept = request.headers.get("accept") ?? "";

  if (accept.includes("text/x-component")) return false;

  const p = url.pathname;

  return (
    p === "/" ||
    p === "/store" ||
    p.startsWith("/store/") ||
    p === "/menu" ||
    p.startsWith("/menu/")
  );
}

export function isNetworkOnlyRequest({ url, request }: RouteMatchContext): boolean {
  if (request.method !== "GET") return true;

  const p = url.pathname;

  // Private / transactional management routes
  if (p === "/manage" || p.startsWith("/manage/") || p === "/admin" || p.startsWith("/admin/")) {
    return true;
  }

  // Cart and checkout should always be fresh
  if (p === "/cart" || p.startsWith("/cart/") || p === "/checkout" || p.startsWith("/checkout/")) {
    return true;
  }

  // Backend API calls (loopback / tenant / commerce rewrites)
  if (p.startsWith("/commerce/") || p.startsWith("/tenant/") || p.startsWith("/api/")) {
    return true;
  }

  // Next.js RSC Flight data and Action requests
  const accept = request.headers.get("accept") ?? "";

  if (
    accept.includes("text/x-component") ||
    request.headers.has("next-action") ||
    request.headers.has("rsc")
  ) {
    return true;
  }

  return false;
}

export function createMenuzaRuntimeCaching(): RuntimeCaching[] {
  return [
    // 1. Explicit NetworkOnly for private/management routes, commerce APIs, cart, checkout, RSC payloads
    {
      matcher: isNetworkOnlyRequest,
      handler: new NetworkOnly(),
    },

    // 2. CacheFirst for immutable/hashed Next.js static assets
    {
      matcher: isStaticAssetRequest,
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.static,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 120,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    // 3. StaleWhileRevalidate for public images and icons
    {
      matcher: isPublicImageRequest,
      handler: new StaleWhileRevalidate({
        cacheName: CACHE_NAMES.images,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 80,
            maxAgeSeconds: 14 * 24 * 60 * 60, // 14 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    // 4. NetworkFirst for storefront / menu navigation documents
    {
      matcher: isStorefrontDocumentRequest,
      handler: new NetworkFirst({
        cacheName: CACHE_NAMES.storefront,
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    // 5. Default fallback: NetworkOnly
    {
      matcher: () => true,
      handler: new NetworkOnly(),
    },
  ];
}

/**
 * Removes outdated caches belonging to previous versions of Menuza or legacy defaultCache.
 */
export async function cleanupOutdatedMenuzaCaches(
  cacheStorage: { keys: () => Promise<string[]>; delete: (k: string) => Promise<boolean> },
  activeCacheNames: string[] = Object.values(CACHE_NAMES),
): Promise<string[]> {
  const allKeys = await cacheStorage.keys();
  const deleted: string[] = [];

  for (const key of allKeys) {
    const isOutdatedMenuza = key.startsWith(`${CACHE_PREFIX}-`) && !activeCacheNames.includes(key);
    const isLegacy = LEGACY_CACHE_NAMES.includes(key);

    if (isOutdatedMenuza || isLegacy) {
      await cacheStorage.delete(key);
      deleted.push(key);
    }
  }

  return deleted;
}
