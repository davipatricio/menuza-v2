/**
 * Shared helpers for the account procedures (MEN-225).
 *
 * These are member-level, not store-level: a management account outlives any
 * single store, so nothing here resolves a `storeSlug` or opens a tenant scope.
 * `Session` is not a tenant-scoped model, so it is read through `unscoped()`
 * exactly like the session lookup itself.
 *
 * Two properties of the session table drive the whole file:
 *
 *  - `Session.id` is the SHA-256 digest of the bearer token, never the token. So
 *    a digest the client echoes back is already the storage key and must not be
 *    hashed again, while the caller's raw token (which `requireSession` returns)
 *    must be hashed once to become comparable.
 *  - A revocation is `revokedAt` being set, not a row disappearing. A revoked
 *    row stays for the audit trail, so "how many did I just revoke" is answered
 *    by the affected-row count and an already-revoked row counts as zero.
 */
import { hashSessionToken } from "@menuza/orpc-server/auth";
import { and, db, unscoped } from "@menuza/db";

/** The caller's own session digest, for excluding the current row. */
export function currentSessionDigest(rawToken: string): string {
  return hashSessionToken(rawToken);
}

/**
 * Revokes the given digests of a member and returns how many rows it actually
 * changed. `revokedAt: null` in the filter is what makes the count honest: a
 * row that was already revoked is not re-revoked, so it is not reported.
 *
 * `updateAndCount` (not `updateAll`) is the counting terminal; `updateAll`
 * returns the updated rows and would make this fetch them all to count them.
 */
export async function revokeSessionDigests(
  memberId: string,
  digests: readonly string[],
): Promise<number> {
  if (digests.length === 0) return 0;

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  return await unscoped(() =>
    db.orm.public.Session.where((session) =>
      and(session.memberId.eq(memberId), session.id.in([...digests]), session.revokedAt.eq(null)),
    ).updateAndCount({ revokedAt: now }),
  );
}

/**
 * Revokes every live session of a member except one — the response to a
 * suspected compromise, and what a password change runs on its own so a stolen
 * cookie cannot outlive the credential it was opened with.
 *
 * The exclusion is a `notIn` in the statement rather than a fetch-then-filter, so
 * it is one round trip and cannot miss a session created in between.
 */
export function revokeAllSessionsExcept(memberId: string, keepDigest: string): Promise<number> {
  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  return unscoped(() =>
    db.orm.public.Session.where((session) =>
      and(
        session.memberId.eq(memberId),
        session.id.notIn([keepDigest]),
        session.revokedAt.eq(null),
      ),
    ).updateAndCount({ revokedAt: now }),
  );
}
