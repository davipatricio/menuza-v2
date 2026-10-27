/**
 * Encryption at rest for per-tenant integration credentials (PRODUCT.md §32:
 * "credenciais por tenant ... criptografadas no banco com chave mestra lida do
 * ambiente").
 *
 * AES-256-GCM with a random 96-bit IV per call and the auth tag in the
 * envelope, so a tampered ciphertext fails loudly instead of decrypting into a
 * different secret. The master key is read from the environment on every call
 * and never cached: rotating it must not require a process restart to take
 * effect for new writes.
 *
 * ponytail: one key, no key rotation. Re-encrypting on rotation needs a
 * `keyId` in the envelope and a re-encrypt pass; the `v1.` prefix is what makes
 * that a forward-compatible change instead of a migration of every row.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

const ENVELOPE_VERSION = "v1";

const IV_BYTES = 12;

const KEY_BYTES = 32;

/** The environment variable holding the base64url-encoded 32-byte master key. */
export const INTEGRATION_SECRET_KEY_ENV = "INTEGRATION_SECRET_KEY";

function masterKey(): Buffer {
  const raw = process.env[INTEGRATION_SECRET_KEY_ENV] ?? "";

  if (raw === "") {
    throw new Error(
      `${INTEGRATION_SECRET_KEY_ENV} is not set; integration credentials cannot be stored`,
    );
  }

  const key = Buffer.from(raw, "base64url");

  if (key.length !== KEY_BYTES) {
    throw new Error(`${INTEGRATION_SECRET_KEY_ENV} must decode to ${KEY_BYTES} bytes (base64url)`);
  }

  return key;
}

/** `v1.<iv-b64>.<tag-b64>.<ciphertext-b64>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    ENVELOPE_VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split(".");

  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error("Malformed secret envelope");
  }

  const iv = parts[1];

  const tag = parts[2];

  const ciphertext = parts[3];

  if (iv === undefined || tag === undefined || ciphertext === undefined) {
    throw new Error("Malformed secret envelope");
  }

  const decipher = createDecipheriv(ALGORITHM, masterKey(), Buffer.from(iv, "base64"));

  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
