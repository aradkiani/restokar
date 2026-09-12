import { ok, parseBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { PlatformSettingsSchema } from "@/lib/validation";
import { getPlatformSettings, setBackupEmail } from "@/lib/backup/settings";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Current platform settings. Admin-only, like everything under /api/admin. */
export const GET = route(async () => {
  await requireAdmin();
  const settings = await getPlatformSettings();
  return ok(settings);
});

/**
 * Changes where twice-daily backups are delivered.
 *
 * Kept in the database rather than the environment precisely so this can change
 * without a redeploy. It is audited because redirecting the backups is a way to
 * quietly obtain every customer record the platform holds — the same class of
 * action as granting subscription time, and worth the same trail.
 */
export const PATCH = route(async (request: Request) => {
  const admin = await requireAdmin();
  const input = await parseBody(request, PlatformSettingsSchema);

  const previous = await getPlatformSettings();
  const next = input.backupEmail.trim() === "" ? null : input.backupEmail.trim();

  if (next === previous.backupEmail) {
    return ok(previous);
  }

  const settings = await setBackupEmail(next);

  await recordAudit({
    actor: admin,
    restaurantId: null,
    action: "SETTINGS_CHANGED",
    summary: `نشانی دریافت پشتیبان از «${previous.backupEmail ?? "—"}» به «${next ?? "—"}» تغییر کرد`,
    entityType: "PlatformSetting",
    entityId: "singleton",
    // The addresses themselves are the change being recorded; there is no
    // secret here, and without them the entry cannot answer "changed to what?".
    metadata: { from: previous.backupEmail, to: next },
    ip: clientIp(request),
  });

  return ok(settings);
});
