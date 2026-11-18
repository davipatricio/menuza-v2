import { describe, expect, test } from "bun:test";
import { seoWarnings } from "../src/features/catalog/components/seo/seo-warnings.ts";

const base = {
  title: "Título",
  description: "Descrição",
  canonicalUrl: null,
  jsonLd: null,
  links: [],
  pageUrl: "https://loja.menuza.app/menu/1",
};

describe("seoWarnings", () => {
  test("avisa quando o título passa do corte da busca", () => {
    const [warning] = seoWarnings({ ...base, title: "x".repeat(61) });

    expect(warning?.field).toBe("title");
  });

  test("avisa quando o canônico aponta para outro host", () => {
    const [warning] = seoWarnings({
      ...base,
      canonicalUrl: "https://outra-loja.com/menu/1",
    });

    expect(warning?.field).toBe("canonicalUrl");
  });

  test("avisa sobre URL repetida e idioma repetido nos links", () => {
    const warnings = seoWarnings({
      ...base,
      links: [
        { rel: "alternate", href: "https://loja.menuza.app/en", hreflang: "en" },
        { rel: "alternate", href: "https://loja.menuza.app/en", hreflang: "en" },
      ],
    });

    expect(warnings.map((warning) => warning.message).join(" ")).toContain("repete");
    expect(warnings.map((warning) => warning.message).join(" ")).toContain('"en"');
  });

  test("avisa quando a URL do JSON-LD difere do canônico efetivo", () => {
    const [warning] = seoWarnings({
      ...base,
      jsonLd: JSON.stringify({ "@type": "Product", url: "https://loja.menuza.app/outra" }),
    });

    expect(warning?.field).toBe("jsonLd");
  });

  test("não avisa quando os campos estão dentro do esperado", () => {
    expect(
      seoWarnings({
        ...base,
        links: [{ rel: "sameAs", href: "https://instagram.com/loja", hreflang: null }],
      }),
    ).toEqual([]);
  });
});
