import { describe, expect, test } from "bun:test";
import { analyzeJsonLd, parseJsonLd } from "./json-ld-validation.ts";

const VALID_PRODUCT = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Pão de queijo",
  url: "https://paodavila.menuza.app/menu/pao-de-queijo",
  image: ["https://cdn.menuza.app/pao.jpg"],
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "BRL",
    lowPrice: "19.90",
    highPrice: "24.90",
    offerCount: 2,
  },
});

function warningMessages(source: string): string[] {
  return analyzeJsonLd(source)
    .issues.filter((issue) => issue.severity === "warning")
    .map((issue) => issue.message);
}

describe("parseJsonLd", () => {
  test("a valid document parses", () => {
    const parsed = parseJsonLd(VALID_PRODUCT);

    expect(parsed.ok).toBe(true);
  });

  test("an unclosed object points at the end of the document", () => {
    const parsed = parseJsonLd("{");

    expect(parsed.ok).toBe(false);

    if (parsed.ok) return;

    expect(parsed.error.line).toBe(1);
    expect(parsed.error.column).toBe(2);
    expect(parsed.error.message.length).toBeGreaterThan(0);
  });

  test("a missing comma points at the line where the document breaks", () => {
    const parsed = parseJsonLd('{\n  "@type": "Product",\n  "name": "x",\n}');

    expect(parsed.ok).toBe(false);

    if (parsed.ok) return;

    expect(parsed.error.line).toBe(4);
    expect(parsed.error.column).toBe(1);
  });

  test("a trailing comma points at the offending brace", () => {
    const parsed = parseJsonLd('{"a": 1,}');

    expect(parsed.ok).toBe(false);

    if (parsed.ok) return;

    expect(parsed.error.line).toBe(1);
    expect(parsed.error.column).toBe(9);
  });

  test("windows line breaks count as one", () => {
    const parsed = parseJsonLd('{\r\n"name": "x",\r\n}');

    expect(parsed.ok).toBe(false);

    if (parsed.ok) return;

    expect(parsed.error.line).toBe(3);
    expect(parsed.error.column).toBe(1);
  });
});

describe("analyzeJsonLd", () => {
  test("an empty field is not an error", () => {
    expect(analyzeJsonLd(null)).toEqual({ document: null, error: null, issues: [] });
    expect(analyzeJsonLd("   ").issues).toEqual([]);
  });

  test("a complete product has nothing to report", () => {
    const analysis = analyzeJsonLd(VALID_PRODUCT);

    expect(analysis.error).toBeNull();
    expect(analysis.issues).toEqual([]);
    expect(analysis.document).not.toBeNull();
    expect(analysis.document?.nodes).toHaveLength(1);
    expect(analysis.document?.nodes[0]?.name).toBe("Pão de queijo");
  });

  test("a syntax error is the only issue and it carries the position", () => {
    const analysis = analyzeJsonLd('{"@type": "Product",}');

    expect(analysis.error?.line).toBe(1);
    expect(analysis.issues).toHaveLength(1);
    expect(analysis.issues[0]?.severity).toBe("error");
    expect(analysis.issues[0]?.message).toContain("Linha 1");
  });

  test("a missing context and type are warnings", () => {
    const messages = warningMessages('{"name": "Pão de queijo"}');

    expect(messages).toContain("Falta `@context`. Use `https://schema.org`.");
    expect(messages).toContain("Falta `@type`. Use `Product`, `Store` ou outro tipo.");
  });

  test("a context that points elsewhere is a warning", () => {
    const messages = warningMessages('{"@context": "https://example.com", "@type": "Product"}');

    expect(messages).toContain("`@context` não aponta para `https://schema.org`.");
  });

  test("a product without the fields the search needs is warned about", () => {
    const messages = warningMessages('{"@context": "https://schema.org", "@type": "Product"}');

    expect(messages).toContain("Falta `name` — o nome do produto.");
    expect(messages).toContain("Falta `url` — o endereço da página do produto.");
    expect(messages).toContain("Falta `image` — a busca usa a imagem do produto.");
    expect(messages).toContain("Falta `offers` — é o que mostra o preço no resultado da busca.");
  });

  test("an aggregate offer needs its price fields", () => {
    const analysis = analyzeJsonLd(
      '{"@context": "https://schema.org", "@type": "Product", "name": "x", "url": "u", "image": "i", "offers": {"@type": "AggregateOffer"}}',
    );

    const paths = analysis.issues.map((issue) => issue.path);

    expect(paths).toContain("$.offers.lowPrice");
    expect(paths).toContain("$.offers.priceCurrency");
  });

  test("a store is warned about its name and url", () => {
    const messages = warningMessages('{"@context": "https://schema.org", "@type": "Store"}');

    expect(messages).toContain("Falta `name` — o nome da loja.");
    expect(messages).toContain("Falta `url` — o endereço da loja.");
  });

  test("a graph is read as the list of nodes it carries", () => {
    const analysis = analyzeJsonLd(
      '{"@context": "https://schema.org", "@graph": [{"@type": "Product"}]}',
    );

    expect(analysis.document?.nodes).toHaveLength(1);
    expect(analysis.document?.nodes[0]?.["@type"]).toBe("Product");
    expect(analysis.issues.map((issue) => issue.path)).toContain("$");
  });

  test("an array of nodes is read as the list of its items", () => {
    const analysis = analyzeJsonLd('[{"@type": "Product"}]');

    expect(analysis.document?.nodes).toHaveLength(1);
    expect(analysis.document?.nodes[0]?.["@type"]).toBe("Product");
    expect(analysis.issues.map((issue) => issue.path)).toContain("$");
  });

  test("the same warning is reported once", () => {
    const analysis = analyzeJsonLd('{"@context": "https://schema.org", "@type": "Product"}');

    const names = analysis.issues.filter((issue) => issue.message.startsWith("Falta `name`"));

    expect(names).toHaveLength(1);
  });
});
