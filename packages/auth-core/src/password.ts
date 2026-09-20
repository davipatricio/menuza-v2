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

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
