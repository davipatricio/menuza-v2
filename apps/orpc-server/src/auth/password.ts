/**
 * Native Argon2id password hashing via Bun.password.
 * Parameters pinned by ADR-0004 and MEN-167:
 *  - algorithm: argon2id
 *  - memoryCost: 65536 KiB (64 MiB)
 *  - timeCost: 3 iterations
 */

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 3,
  });
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  // A member without a password hash (bot account, or a Google-only account)
  // has no password to verify; fail closed instead of letting the hasher throw
  // on null or, worse, treating a missing hash as a match.
  if (hash === null) return false;

  return Bun.password.verify(password, hash);
}
