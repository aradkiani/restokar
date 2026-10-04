import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError } from "./auth/guards";
import { env, isProd } from "./env";
import { recordError } from "./error-log";

/** Methods that change state and therefore need a cross-site origin check. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Rejects state-changing requests issued from another origin.
 *
 * The session cookie is `SameSite=Lax`, which already stops a cross-site form
 * POST from carrying it, so this is a second line rather than the only one. It
 * is worth having because Lax is a browser-side promise: it does nothing for a
 * client that does not implement it, it has had implementation gaps, and it
 * says nothing about a request coming from another *subdomain* of the same
 * site, which is the case a menu hosted per venue would eventually create.
 *
 * `Origin` is compared against the Host the request actually arrived on as well
 * as the configured public URL. A browser sets Host to the server it is talking
 * to and Origin to the page that initiated the request, so in a genuine
 * cross-site attack the two differ and no attacker page can change that.
 * Matching Host as well is what keeps the app usable over a LAN address in
 * development without weakening the check in production.
 *
 * A missing `Origin` is allowed through: non-browser callers (curl, a server
 * script, a health check) omit it, and a browser that omits it is not carrying
 * a cross-site page's cookies either.
 */
function assertSameOrigin(request: Request): void {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  if (!origin) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Cross-origin request rejected", "BAD_ORIGIN");
  }

  const allowed = new Set<string>();
  try {
    allowed.add(new URL(env.NEXT_PUBLIC_APP_URL).host);
  } catch {
    /* validated at boot; ignore here */
  }
  const host = request.headers.get("host");
  if (host) allowed.add(host);

  if (!allowed.has(originHost)) {
    throw new HttpError(403, "Cross-origin request rejected", "BAD_ORIGIN");
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, message: string, code?: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, code, details } }, { status });
}

/**
 * Wraps a route handler so every thrown error becomes a predictable JSON body
 * instead of an HTML error page — and so internal messages never leak to
 * clients in production.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      // Next.js always passes the Request first, even when the handler ignores
      // it, so this covers every route that goes through the wrapper.
      if (args[0] instanceof Request) assertSameOrigin(args[0]);

      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return fail(error.status, error.message, error.code, error.details);
      }
      if (error instanceof ZodError) {
        return fail(422, "Validation failed", "VALIDATION_ERROR", flattenZodError(error));
      }
      // `redirect()` and `notFound()` signal control flow via throw — rethrow.
      if (isNextControlFlow(error)) throw error;

      // Recorded for the admin's error log (which also writes the process log).
      const request = args[0] instanceof Request ? args[0] : null;
      await recordError({
        source: "SERVER",
        message: String((error as Error)?.message ?? error),
        stack: (error as Error)?.stack ?? null,
        path: request ? new URL(request.url).pathname : null,
        method: request?.method ?? null,
        context: "route",
        userAgent: request?.headers.get("user-agent") ?? null,
      });
      return fail(
        500,
        isProd ? "Internal server error" : String((error as Error)?.message ?? error),
        "INTERNAL_ERROR",
      );
    }
  };
}

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE")
  );
}

export function flattenZodError(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Parse a JSON body against a schema, rejecting malformed payloads cleanly. */
export async function parseBody<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<import("zod").infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON", "INVALID_JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<S extends ZodType>(
  request: Request,
  schema: S,
): import("zod").infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}
