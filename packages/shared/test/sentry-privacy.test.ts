import { describe, expect, test } from "bun:test";

import {
  scrubPiiText,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryPiiSafeDataCollection,
} from "../src/sentry-privacy/index.ts";

describe("scrubPiiText", () => {
  test("redacts e-mail addresses", () => {
    expect(scrubPiiText("falha para buyer@example.com")).toBe("falha para [redacted-email]");
  });

  test("redacts formatted CPF and CNPJ", () => {
    expect(scrubPiiText("cpf 123.456.789-09")).toBe("cpf [redacted-cpf]");
    expect(scrubPiiText("cnpj 12.345.678/0001-95")).toBe("cnpj [redacted-cnpj]");
  });

  test("redacts phone numbers", () => {
    expect(scrubPiiText("tel +55 11 98888-7777")).toBe("tel [redacted-phone]");
  });

  test("redacts card numbers", () => {
    expect(scrubPiiText("cartao 4111 1111 1111 1111")).toBe("cartao [redacted-card]");
  });

  test("leaves non-PII text untouched", () => {
    expect(scrubPiiText("erro interno ao processar pedido 42")).toBe(
      "erro interno ao processar pedido 42",
    );
  });
});

describe("scrubSentryEvent", () => {
  test("drops user, request and extra payloads", () => {
    const event = {
      user: { email: "buyer@example.com" },
      request: { cookies: "session=abc" },
      extra: { note: "cpf 123.456.789-09" },
    };

    const scrubbed = scrubSentryEvent(event);

    expect("user" in scrubbed).toBe(false);
    expect("request" in scrubbed).toBe(false);
    expect("extra" in scrubbed).toBe(false);
  });

  test("redacts text fields and breadcrumbs", () => {
    const event = {
      message: "falha para buyer@example.com",
      logentry: { message: "cpf 123.456.789-09" },
      exception: { values: [{ value: "email a@b.com" }] },
      breadcrumbs: [
        { category: "console", message: "tel +55 11 98888-7777", data: { password: "x" } },
      ],
    };

    const scrubbed = scrubSentryEvent(event);
    const [breadcrumb] = scrubbed.breadcrumbs ?? [];

    expect(scrubbed.message).toBe("falha para [redacted-email]");
    expect(scrubbed.logentry?.message).toBe("cpf [redacted-cpf]");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("email [redacted-email]");
    expect(breadcrumb?.message).toBe("tel [redacted-phone]");
    expect(breadcrumb !== undefined && "data" in breadcrumb).toBe(false);
  });
});

describe("scrubSentryBreadcrumb", () => {
  test("removes data and redacts the message", () => {
    const scrubbed = scrubSentryBreadcrumb({
      category: "console",
      message: "buyer@example.com",
      data: { authorization: "Bearer abc" },
    });

    expect("data" in scrubbed).toBe(false);
    expect(scrubbed.message).toBe("[redacted-email]");
  });
});

describe("sentryPiiSafeDataCollection", () => {
  test("disables every data category", () => {
    expect(sentryPiiSafeDataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 5,
    });
  });
});
