import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Turns preview on (or off with ?exit=1) and sends the admin to the page.
 *
 * Draft mode is a cookie; the pages additionally check that the visitor is the
 * platform admin before showing any draft, so the cookie alone shows nothing.
 * Only same-site paths are accepted as the destination, so this cannot be used
 * to bounce someone to another website.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const draft = await draftMode();

  if (url.searchParams.get("exit")) {
    draft.disable();
    return NextResponse.redirect(new URL("/admin/content", url));
  }

  const path = url.searchParams.get("path") ?? "/";
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  draft.enable();
  return NextResponse.redirect(new URL(safe, url));
}
