import { describe, expect, test } from "bun:test";
import {
  CACHE_NAMES,
  cleanupOutdatedMenuzaCaches,
  isNetworkOnlyRequest,
  isPublicImageRequest,
  isStaticAssetRequest,
  isStorefrontDocumentRequest,
} from "../src/lib/sw-cache-rules.ts";

function createReq(
  urlStr: string,
  init?: {
    method?: string;
    mode?: RequestMode;
    destination?: RequestDestination;
    headers?: Record<string, string>;
  },
) {
  const url = new URL(urlStr);
  const headers = new Headers(init?.headers);

  const request = new Request(urlStr, {
    method: init?.method ?? "GET",
    headers,
  });

  if (init?.mode) {
    Object.defineProperty(request, "mode", { value: init.mode });
  }

  if (init?.destination) {
    Object.defineProperty(request, "destination", { value: init.destination });
  }

  return { url, request };
}

describe("sw-cache-rules", () => {
  describe("isStaticAssetRequest", () => {
    test("matches Next static assets and favicon", () => {
      expect(
        isStaticAssetRequest(createReq("https://app.menuza.com/_next/static/chunks/main.js")),
      ).toBe(true);
      expect(isStaticAssetRequest(createReq("https://app.menuza.com/favicon.ico"))).toBe(true);
      expect(isStaticAssetRequest(createReq("https://app.menuza.com/manifest.webmanifest"))).toBe(
        true,
      );
      expect(isStaticAssetRequest(createReq("https://app.menuza.com/store"))).toBe(false);
    });

    test("ignores non-GET", () => {
      expect(
        isStaticAssetRequest(
          createReq("https://app.menuza.com/_next/static/test.js", { method: "POST" }),
        ),
      ).toBe(false);
    });
  });

  describe("isPublicImageRequest", () => {
    test("matches same-origin image formats and /_next/image", () => {
      expect(
        isPublicImageRequest(createReq("https://app.menuza.com/_next/image?url=%2Flogo.png")),
      ).toBe(true);
      expect(isPublicImageRequest(createReq("https://app.menuza.com/banner.webp"))).toBe(true);
      expect(
        isPublicImageRequest(
          createReq("https://app.menuza.com/api/dynamic-avatar", { destination: "image" }),
        ),
      ).toBe(true);
    });

    test("rejects private paths even with image destination", () => {
      expect(
        isPublicImageRequest(
          createReq("https://app.menuza.com/manage/receipt.png", { destination: "image" }),
        ),
      ).toBe(false);
    });
  });

  describe("isStorefrontDocumentRequest", () => {
    test("matches storefront and menu navigation", () => {
      expect(
        isStorefrontDocumentRequest(
          createReq("https://tenant.menuza.com/store", {
            mode: "navigate",
            destination: "document",
          }),
        ),
      ).toBe(true);

      expect(
        isStorefrontDocumentRequest(
          createReq("https://tenant.menuza.com/menu/pizza-margherita", {
            mode: "navigate",
            destination: "document",
          }),
        ),
      ).toBe(true);
    });

    test("rejects non-navigation or RSC data calls", () => {
      expect(
        isStorefrontDocumentRequest(
          createReq("https://tenant.menuza.com/store", {
            mode: "navigate",
            destination: "document",
            headers: { accept: "text/x-component" },
          }),
        ),
      ).toBe(false);

      expect(
        isStorefrontDocumentRequest(createReq("https://tenant.menuza.com/store", { mode: "cors" })),
      ).toBe(false);
    });
  });

  describe("isNetworkOnlyRequest", () => {
    test("forces management, cart, checkout, APIs, RSC to NetworkOnly", () => {
      expect(isNetworkOnlyRequest(createReq("https://app.menuza.com/manage/orders"))).toBe(true);
      expect(isNetworkOnlyRequest(createReq("https://app.menuza.com/admin/settings"))).toBe(true);
      expect(isNetworkOnlyRequest(createReq("https://app.menuza.com/cart"))).toBe(true);
      expect(isNetworkOnlyRequest(createReq("https://app.menuza.com/checkout"))).toBe(true);
      expect(isNetworkOnlyRequest(createReq("https://app.menuza.com/commerce/orders"))).toBe(true);
      expect(isNetworkOnlyRequest(createReq("https://app.menuza.com/tenant/health"))).toBe(true);

      expect(
        isNetworkOnlyRequest(
          createReq("https://app.menuza.com/store", { headers: { "next-action": "abc123" } }),
        ),
      ).toBe(true);

      expect(
        isNetworkOnlyRequest(createReq("https://app.menuza.com/store", { headers: { rsc: "1" } })),
      ).toBe(true);
    });

    test("allows public storefront GET", () => {
      expect(isNetworkOnlyRequest(createReq("https://app.menuza.com/store"))).toBe(false);
    });
  });

  describe("cleanupOutdatedMenuzaCaches", () => {
    test("deletes previous menuza versions and legacy serwist caches", async () => {
      const existing = [
        "menuza-static-v0",
        "menuza-images-v0",
        "pages",
        "pages-rsc",
        "others",
        CACHE_NAMES.static,
        CACHE_NAMES.images,
        "unrelated-third-party-cache",
      ];

      const deleted: string[] = [];

      const fakeStorage = {
        async keys() {
          return [...existing];
        },
        async delete(k: string) {
          deleted.push(k);

          return true;
        },
      };

      const result = await cleanupOutdatedMenuzaCaches(fakeStorage);

      expect(result).toEqual([
        "menuza-static-v0",
        "menuza-images-v0",
        "pages",
        "pages-rsc",
        "others",
      ]);

      expect(deleted).toEqual([
        "menuza-static-v0",
        "menuza-images-v0",
        "pages",
        "pages-rsc",
        "others",
      ]);
    });
  });
});
