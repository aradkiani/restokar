import { ok, route } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";

export const runtime = "nodejs";

export const POST = route(async () => {
  await destroySession();
  return ok({ redirectTo: "/" });
});
