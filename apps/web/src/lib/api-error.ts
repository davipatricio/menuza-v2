/**
 * The error the web app throws for a rejected REST call and the islands switch
 * on by `code`.
 *
 * The tenant clients map an HTTP status to the same `UNAUTHORIZED`,
 * `CONFLICT`, ... codes the screens already branch on. Local so `apps/web`
 * needs no oRPC package just to carry an error.
 */
export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}
