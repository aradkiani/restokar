/**
 * Scheduled customer-data backup.
 *
 *   npx tsx scripts/backup.ts          take a backup and email it
 *   npx tsx scripts/backup.ts --dry    build the archive, skip delivery
 *
 * Run twice a day by the operating system's scheduler rather than by a timer
 * inside the app. Next.js runs as several instances behind a proxy, so an
 * in-process `setInterval` would fire once per instance — four identical
 * archives and four identical emails every twelve hours — and would reset on
 * every deploy or restart. A scheduler owned by the OS runs exactly once, keeps
 * running when the app is down, and reports its own failures.
 *
 * See docs/BACKUPS.md for installing the schedule on Windows and Linux.
 */
// MUST be first: populates process.env before src/lib/env.ts is evaluated.
import "./load-env";
import { runBackup } from "../src/lib/backup/run";
import { createBackup } from "../src/lib/backup/export";
import { recordBackupOutcome } from "../src/lib/backup/settings";

async function main() {
  const dryRun = process.argv.includes("--dry");

  if (dryRun) {
    // Recorded like any other run. "--dry" skips delivery, not the backup: an
    // archive lands on disk exactly as it would otherwise, and a path that
    // writes one without saying so is how the settings row came to read
    // "failed" from August while a good archive from September sat beside it.
    let result;
    try {
      result = await createBackup();
    } catch (error) {
      await recordBackupOutcome({
        status: "failed",
        archived: false,
        error: ((error as Error)?.message ?? String(error)).slice(0, 500),
      });
      throw error;
    }

    await recordBackupOutcome({
      // The archive succeeded; delivery was declined by the operator rather
      // than failed, and there is no status for "deliberately not sent" that
      // the admin console already understands.
      status: "ok",
      archived: true,
      error: null,
      bytes: result.bytes,
    });

    console.log(
      `[backup] dry run wrote ${result.filePath} ` +
        `(${(result.bytes / 1024).toFixed(1)} KB, ${result.uploadCount} upload(s))`,
    );
    console.log("[backup] delivery skipped (--dry)");
    return 0;
  }

  const outcome = await runBackup();
  console.log(`[backup] ${outcome.status}: ${outcome.message}`);

  // A non-zero exit is what makes the OS scheduler surface the failure: Task
  // Scheduler shows a non-zero "Last Run Result", and systemd marks the unit
  // failed and can trigger OnFailure. Exiting 0 on a failed delivery would make
  // the schedule look permanently healthy.
  //
  // "not configured" is a warning rather than a failure: the archive was taken
  // and kept, and an operator who has not yet set an address should not have a
  // red schedule until they do.
  return outcome.status === "ok" || outcome.status === "not_configured" ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("[backup] unhandled failure", error);
    process.exit(1);
  });
