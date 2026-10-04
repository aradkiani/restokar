import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordError } from "@/lib/error-log";

export const runtime = "nodejs";

const ClientError = z.object({
  message: z.string().trim().min(1).max(1_000),
  stack: z.string().max(8_000).optional(),
  path: z.string().max(500).optional(),
  digest: z.string().max(100).optional(),
});

/**
 * Errors from a browser — a guest's menu or a dashboard that crashed.
 *
 * Public by necessity: the guest has no account. Bounded three ways so it
 * cannot be used to fill the database: same-origin only (the `route()`
 * wrapper), a per-address rate limit, and grouping on write, so a flood of
 * one error is one row with a large count. Always answers 204-style success,
 * so a reporter never retries in a loop.
 */
export const POST = route(async (request: Request) => {
  const limit = await rateLimit(`client-error:${clientIp(request)}`, {
    limit: 30,
    windowSeconds: 3600,
  });
  if (!limit.allowed) return ok({ recorded: false });

  const input = await parseBody(request, ClientError);
  await recordError({
    source: "CLIENT",
    message: input.message,
    stack: input.stack ?? null,
    path: input.path ?? null,
    context: "browser",
    digest: input.digest ?? null,
    userAgent: request.headers.get("user-agent"),
  });
  return ok({ recorded: true });
});
