/**
 * Push endpoint policy shared by API registration and worker dispatch.
 *
 * Only the documented push provider hosts (and their subdomains) are allowed.
 * Suffixes are matched at `.` boundaries so lookalike hosts such as
 * `fcm.googleapis.com.attacker.tld` are rejected. Browser-safe: uses only the
 * global `URL` parser, no Node builtins.
 */
export const PUSH_ENDPOINT_SUFFIXES = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "notify.windows.com",
  "web.push.apple.com",
] as const;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  if (url.username !== "" || url.password !== "") return false;

  if (url.port !== "") return false;

  const host = url.hostname.toLowerCase();

  return PUSH_ENDPOINT_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
