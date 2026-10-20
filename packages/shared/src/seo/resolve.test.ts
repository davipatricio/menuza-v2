import { describe, expect, test } from "bun:test";
import { resolveSeo } from "./resolve.ts";
import type { SeoContext, SeoFields, SeoMetaRow, StoreSeoDefaults } from "./types.ts";

const CONTEXT: SeoContext = { storeName: "Pão da Vila", entityName: "Pão de queijo" };

const EMPTY: SeoFields = {
  title: null,
  description: null,
  canonicalUrl: null,
  socialImageUrl: null,
  jsonLd: null,
};

function row(entityType: SeoMetaRow["entityType"], fields: Partial<SeoFields>): SeoMetaRow {
  return { entityType, entityId: "id", ...EMPTY, ...fields };
}

function settings(fields: Partial<StoreSeoDefaults>): StoreSeoDefaults {
  return {
    seoTitleTemplate: null,
    seoDescriptionTemplate: null,
    seoSocialImageUrl: null,
    ...fields,
  };
}

describe("resolveSeo", () => {
  test("a set entity field wins and reports source entity", () => {
    const resolved = resolveSeo({
      entity: row("product", {
        title: "Pão de queijo Mineiro",
        description: "Receita da casa.",
        canonicalUrl: "https://menuza.app/store/pao-da-vila/product/pao-de-queijo",
        socialImageUrl: "https://cdn.menuza.app/pao.jpg",
        jsonLd: '{"@type":"Product"}',
      }),
      storeRow: row("store", { title: "Loja", description: "Loja.", socialImageUrl: "s.jpg" }),
      settings: settings({
        seoTitleTemplate: "%entity% — %store%",
        seoDescriptionTemplate: "%store%",
        seoSocialImageUrl: "settings.jpg",
      }),
      context: CONTEXT,
      fallbackTitle: "Menuza",
      fallbackDescription: "Delivery.",
    });

    expect(resolved.title).toBe("Pão de queijo Mineiro");
    expect(resolved.description).toBe("Receita da casa.");
    expect(resolved.canonicalUrl).toBe(
      "https://menuza.app/store/pao-da-vila/product/pao-de-queijo",
    );
    expect(resolved.socialImageUrl).toBe("https://cdn.menuza.app/pao.jpg");
    expect(resolved.jsonLd).toBe('{"@type":"Product"}');
    expect(resolved.source).toEqual({
      title: "entity",
      description: "entity",
      socialImageUrl: "entity",
    });
  });

  test("falls back to the store row when the entity has nothing", () => {
    const resolved = resolveSeo({
      entity: row("category", {}),
      storeRow: row("store", {
        title: "Pão da Vila",
        description: "Pães artesanais.",
        socialImageUrl: "store.jpg",
      }),
      settings: settings({
        seoTitleTemplate: "%entity% — %store%",
        seoSocialImageUrl: "settings.jpg",
      }),
      context: CONTEXT,
      fallbackTitle: "Menuza",
    });

    expect(resolved.title).toBe("Pão da Vila");
    expect(resolved.description).toBe("Pães artesanais.");
    expect(resolved.socialImageUrl).toBe("store.jpg");
    expect(resolved.source).toEqual({
      title: "store",
      description: "store",
      socialImageUrl: "store",
    });
  });

  test("the settings template reports source store", () => {
    const resolved = resolveSeo({
      entity: null,
      storeRow: null,
      settings: settings({
        seoTitleTemplate: "%entity% — %store%",
        seoDescriptionTemplate: "%entity% em %store%",
        seoSocialImageUrl: "settings.jpg",
      }),
      context: CONTEXT,
      fallbackTitle: "Menuza",
    });

    expect(resolved.title).toBe("Pão de queijo — Pão da Vila");
    expect(resolved.description).toBe("Pão de queijo em Pão da Vila");
    expect(resolved.socialImageUrl).toBe("settings.jpg");
    expect(resolved.source).toEqual({
      title: "store",
      description: "store",
      socialImageUrl: "store",
    });
  });

  test("nothing set anywhere yields the fallbacks and source default", () => {
    const resolved = resolveSeo({
      entity: null,
      storeRow: null,
      settings: null,
      context: CONTEXT,
      fallbackTitle: "Menuza",
      fallbackDescription: "Delivery em Recife.",
    });

    expect(resolved.title).toBe("Menuza");
    expect(resolved.description).toBe("Delivery em Recife.");
    expect(resolved.socialImageUrl).toBeNull();
    expect(resolved.canonicalUrl).toBeNull();
    expect(resolved.jsonLd).toBeNull();
    expect(resolved.source).toEqual({
      title: "default",
      description: "default",
      socialImageUrl: "default",
    });
  });

  test("a %city%-only template with no city falls through to the default", () => {
    const resolved = resolveSeo({
      entity: null,
      storeRow: null,
      settings: settings({ seoTitleTemplate: "%city%", seoDescriptionTemplate: " %city% " }),
      context: CONTEXT,
      fallbackTitle: "Menuza",
      fallbackDescription: "Delivery.",
    });

    expect(resolved.title).toBe("Menuza");
    expect(resolved.description).toBe("Delivery.");
    expect(resolved.source.title).toBe("default");
    expect(resolved.source.description).toBe("default");
  });

  test("canonicalUrl and jsonLd never inherit", () => {
    const resolved = resolveSeo({
      entity: null,
      storeRow: row("store", {
        title: "Pão da Vila",
        canonicalUrl: "https://menuza.app/store/pao-da-vila",
        jsonLd: '{"@type":"Store"}',
      }),
      settings: null,
      context: CONTEXT,
      fallbackTitle: "Menuza",
    });

    expect(resolved.canonicalUrl).toBeNull();
    expect(resolved.jsonLd).toBeNull();
  });

  test("socialImageUrl chains independently of the title", () => {
    const resolved = resolveSeo({
      entity: row("product", { title: "Pão de queijo" }),
      storeRow: row("store", { socialImageUrl: "store.jpg" }),
      settings: settings({ seoSocialImageUrl: "settings.jpg", seoTitleTemplate: "%entity%" }),
      context: CONTEXT,
      fallbackTitle: "Menuza",
    });

    expect(resolved.title).toBe("Pão de queijo");
    expect(resolved.socialImageUrl).toBe("store.jpg");
    expect(resolved.source.title).toBe("entity");
    expect(resolved.source.socialImageUrl).toBe("store");
  });
});
