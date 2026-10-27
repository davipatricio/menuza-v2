/**
 * Integration credential encryption — Unit (infrastructure-free).
 *
 * The property that matters is that the envelope is authenticated: a tampered
 * ciphertext must fail, not decrypt into a different secret. The key comes from
 * the environment, so the tests set it per case and restore it after.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { INTEGRATION_SECRET_KEY_ENV, decryptSecret, encryptSecret } from "../src/crypto/secrets.ts";

const KEY = Buffer.alloc(32, 3).toString("base64url");

const OTHER_KEY = Buffer.alloc(32, 9).toString("base64url");

describe("integration secret envelope", () => {
  const original = process.env[INTEGRATION_SECRET_KEY_ENV];

  beforeAll(() => {
    process.env[INTEGRATION_SECRET_KEY_ENV] = KEY;
  });

  beforeEach(() => {
    process.env[INTEGRATION_SECRET_KEY_ENV] = KEY;
  });

  afterAll(() => {
    if (original === undefined) delete process.env[INTEGRATION_SECRET_KEY_ENV];
    else process.env[INTEGRATION_SECRET_KEY_ENV] = original;
  });

  test("round-trips a credential blob", () => {
    const envelope = encryptSecret(JSON.stringify({ secretKey: "sk_live_123" }));

    expect(envelope.startsWith("v1.")).toBe(true);
    expect(decryptSecret(envelope)).toBe(JSON.stringify({ secretKey: "sk_live_123" }));
  });

  test("a fresh IV per call, so the same plaintext never repeats", () => {
    expect(encryptSecret("sk_live_123")).not.toBe(encryptSecret("sk_live_123"));
  });

  test("a tampered ciphertext fails instead of decrypting", () => {
    const envelope = encryptSecret("sk_live_123");

    const parts = envelope.split(".");

    // Flip the last byte of the ciphertext: the GCM tag no longer matches.
    const payload = Buffer.from(parts[3] ?? "", "base64");

    payload[payload.length - 1] = (payload[payload.length - 1] ?? 0) ^ 0xff;

    const tampered = [parts[0], parts[1], parts[2], payload.toString("base64")].join(".");

    expect(() => decryptSecret(tampered)).toThrow();
  });

  test("a different master key cannot read the envelope", () => {
    const envelope = encryptSecret("sk_live_123");

    process.env[INTEGRATION_SECRET_KEY_ENV] = OTHER_KEY;

    expect(() => decryptSecret(envelope)).toThrow();
  });

  test("a missing or malformed key fails closed", () => {
    delete process.env[INTEGRATION_SECRET_KEY_ENV];

    expect(() => encryptSecret("sk_live_123")).toThrow();

    process.env[INTEGRATION_SECRET_KEY_ENV] = "short";

    expect(() => encryptSecret("sk_live_123")).toThrow();
  });

  test("a malformed envelope is refused", () => {
    expect(() => decryptSecret("not-an-envelope")).toThrow();
    expect(() => decryptSecret("v2.a.b.c")).toThrow();
  });
});
