import type { Instrumentation } from "next";

/**
 * Server errors Next.js catches itself — a page or a server action that threw
 * while rendering — go to the platform's own error log, so the admin sees
 * them at /admin/errors instead of only in a terminal nobody watches.
 *
 * Route handlers mostly never reach here: `route()` in src/lib/api.ts turns
 * their errors into a JSON 500 and records them itself.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("./lib/error-log");
  const err = error as { message?: unknown; stack?: unknown; digest?: unknown };
  const userAgent = request.headers["user-agent"];
  await recordError({
    source: "SERVER",
    message: typeof err?.message === "string" ? err.message : String(error),
    stack: typeof err?.stack === "string" ? err.stack : null,
    path: request.path,
    method: request.method,
    context: context.routeType,
    digest: typeof err?.digest === "string" ? err.digest : null,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  });
};
