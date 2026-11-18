/**
 * Runtime configuration for the generated clients.
 *
 * The generated URL builders return browser-relative paths (`/commerce/...`,
 * `/tenant/...`), which is what the web app needs: the browser talks to its own
 * origin and the dev proxy or the production reverse proxy forwards the mount.
 * A native client has no origin to be relative to, so it sets one here, along
 * with the headers it has to send on every call.
 *
 * Values are read at call time, never captured at module load: a native app
 * resolves its store before the first request and can change it afterwards.
 */
export interface ApiClientConfig {
  /** Absolute origin with no trailing slash, e.g. `https://api.menuza.app`. */
  origin: string;
  /** Headers sent with every generated request. */
  headers: Record<string, string>;
}

const initial: ApiClientConfig = { origin: "", headers: {} };

let config: ApiClientConfig = initial;

/** Merges values into the current configuration. */
export function configureApi(next: Partial<ApiClientConfig>): void {
  config = {
    origin: next.origin === undefined ? config.origin : next.origin.replace(/\/+$/, ""),
    headers: next.headers === undefined ? config.headers : { ...config.headers, ...next.headers },
  };
}

/** Drops every configured value. Tests call this between cases. */
export function resetApi(): void {
  config = initial;
}

/** The fetch the generated clients call. Parses the body and keeps the status. */
export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  for (const [name, value] of Object.entries(config.headers)) {
    headers.set(name, value);
  }

  const response = await fetch(`${config.origin}${url}`, { ...options, headers });
  const body = [204, 205, 304].includes(response.status) ? null : await response.text();
  const data: unknown = body ? JSON.parse(body) : {};

  // SAFETY: the generated operation type is the shape its own OpenAPI response
  // declares; the body is that document's JSON, decoded above.
  return { data, status: response.status, headers: response.headers } as T;
}
