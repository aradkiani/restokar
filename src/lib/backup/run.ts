import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../prisma";
import { BACKUPS_ROOT } from "../storage/paths";
import { createBackup, type BackupResult } from "./export";
import { mailFrom, mailerConfigured, sendMail } from "./mailer";
import { getPlatformSettings, recordBackupOutcome } from "./settings";

/**
 * One scheduled backup run: archive, deliver, record.
 *
 * The archive is always written to disk first and always kept, whether or not
 * the email goes out. That ordering is the point — email is a delivery channel
 * that can fail for reasons entirely outside this system (mailbox full, SMTP
 * host down, message too large), and a backup that only exists if the mail
 * server cooperated is not a backup. Delivery failure is reported loudly and
 * the archive stays on disk to be collected by hand.
 */

/**
 * Largest archive worth attaching.
 *
 * Base64 inflates an attachment by roughly a third, so this sits well under the
 * 25MB most providers accept. Measured on the current dataset: ~17.5MB of rows
 * compress to ~1.3MB, so the headroom is real rather than theoretical — but the
 * order tables grow without bound, and the run has to behave predictably on the
 * day it stops fitting rather than bouncing a message nobody reads.
 */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * Local archives to keep — twelve-hourly, so this is a week.
 *
 * Retention exists because the alternative is a disk that fills silently, which
 * takes the whole site down and is a worse outcome than a shorter history.
 */
export const LOCAL_BACKUP_RETENTION = 14;

export type BackupRunStatus = "ok" | "failed" | "not_configured" | "too_large";

export interface BackupRunOutcome {
  status: BackupRunStatus;
  backup: BackupResult | null;
  message: string;
  error?: string;
}

/**
 * Progress output for the scheduled run.
 *
 * `console.log` is banned project-wide because it leaks debug noise into
 * request handlers. This module only ever runs as a scheduled script, where
 * stdout *is* the interface and the scheduler captures it to a log file, so it
 * writes there directly rather than misusing `console.warn` for good news.
 * Failures still go to `console.error`, which is where they belong.
 */
function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function summarise(backup: BackupResult): string {
  const rows = Object.entries(backup.tableCounts)
    .map(([table, count]) => `  ${table.padEnd(24)} ${count}`)
    .join("\n");

  const seconds = (
    (backup.finishedAt.getTime() - backup.startedAt.getTime()) /
    1000
  ).toFixed(1);

  return [
    `Restokar customer-data backup`,
    ``,
    `Taken:    ${backup.startedAt.toISOString()}`,
    `Duration: ${seconds}s`,
    `Archive:  ${backup.fileName} (${formatBytes(backup.bytes)})`,
    `Uploads:  ${backup.uploadCount} file(s), ${formatBytes(backup.uploadBytes)}`,
    ``,
    `Rows by table:`,
    rows,
    ``,
    `The archive is a gzipped tar. To inspect it:`,
    `  tar -tzf ${backup.fileName}`,
    ``,
    `It contains manifest.json, one JSON file per database table under`,
    `database/, and every customer-uploaded image under uploads/.`,
    ``,
    `This file contains customer records and password hashes. Treat the`,
    `mailbox it was delivered to as a sensitive system.`,
  ].join("\n");
}

/** Deletes all but the newest `keep` archives. */
async function pruneLocalBackups(keep: number): Promise<number> {
  let names: string[];
  try {
    names = await readdir(BACKUPS_ROOT);
  } catch {
    return 0;
  }

  const archives = names
    .filter((name) => name.startsWith("restokar-backup-") && name.endsWith(".tar.gz"))
    // The timestamp is embedded in the name and ISO-ordered, so a lexical sort
    // is a chronological one — no need to stat every file.
    .sort()
    .reverse();

  let removed = 0;
  for (const name of archives.slice(keep)) {
    try {
      await unlink(path.join(BACKUPS_ROOT, name));
      removed += 1;
    } catch {
      /* already gone */
    }
  }
  return removed;
}

/**
 * Housekeeping that has to happen regularly and has nowhere better to live.
 *
 * Attached to the backup schedule rather than to a request: both tables
 * accumulate rows that only ever need deleting, and doing it on a request path
 * would make one unlucky customer pay for everyone's cleanup.
 */
async function runMaintenance(): Promise<string> {
  const notes: string[] = [];
  const now = new Date();

  // Written against Prisma directly rather than by calling the helpers in
  // rate-limit.ts and auth/session.ts. Those are `server-only` and session.ts
  // pulls in `next/headers`; importing either would make this module unusable
  // from the scheduled CLI, which is the only place it actually runs.
  try {
    const { count } = await prisma.rateLimit.deleteMany({
      where: { resetAt: { lt: now } },
    });
    notes.push(`rate-limit rows pruned: ${count}`);
  } catch (error) {
    notes.push(`rate-limit prune failed: ${(error as Error).message}`);
  }

  try {
    const { count } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    notes.push(`expired sessions pruned: ${count}`);
  } catch (error) {
    notes.push(`session prune failed: ${(error as Error).message}`);
  }

  // An SMS broadcast is priced with its recipient list frozen onto the row, so
  // a checkout the venue walked away from is a copy of their consenting
  // customers' numbers that nobody paid for and nobody will send. A gateway
  // authority lives for minutes; a day is far past any payment still able to
  // settle. Deleted rather than cancelled: no money moved, so there is nothing
  // to keep a record of, and the numbers are exactly what should not linger.
  try {
    const { count } = await prisma.smsBroadcast.deleteMany({
      where: {
        status: "PENDING_PAYMENT",
        createdAt: { lt: new Date(now.getTime() - 24 * 3_600_000) },
      },
    });
    notes.push(`abandoned SMS broadcasts pruned: ${count}`);
  } catch (error) {
    notes.push(`SMS broadcast prune failed: ${(error as Error).message}`);
  }

  return notes.join("; ");
}

export async function runBackup(): Promise<BackupRunOutcome> {
  let backup: BackupResult;

  try {
    backup = await createBackup();
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    console.error("[backup] archive failed", error);
    // The only path here that produced nothing. `lastBackupAt` must stay where
    // it is, pointing at the newest archive that does exist.
    await recordBackupOutcome({
      status: "failed",
      archived: false,
      error: message.slice(0, 500),
    });
    return {
      status: "failed",
      backup: null,
      message: "Backup archive could not be created.",
      error: message,
    };
  }

  log(
    `[backup] wrote ${backup.fileName} (${formatBytes(backup.bytes)}), ` +
      `${backup.uploadCount} upload(s)`,
  );

  const pruned = await pruneLocalBackups(LOCAL_BACKUP_RETENTION);
  if (pruned > 0) log(`[backup] pruned ${pruned} old archive(s)`);
  log(`[backup] maintenance: ${await runMaintenance()}`);

  const settings = await getPlatformSettings();
  const to = settings.backupEmail?.trim();

  if (!to) {
    const message =
      "No backup email address is set. Set one in the admin console " +
      "(/admin/settings). The archive is on disk but was not delivered.";
    console.warn(`[backup] ${message}`);
    await recordBackupOutcome({
      status: "not_configured",
      archived: true,
      error: message,
      bytes: backup.bytes,
    });
    return { status: "not_configured", backup, message };
  }

  if (!mailerConfigured()) {
    const message =
      "SMTP is not configured (SMTP_HOST is empty), so the archive could not " +
      "be emailed. It is on disk at " +
      backup.filePath;
    console.error(`[backup] ${message}`);
    await recordBackupOutcome({
      status: "failed",
      archived: true,
      error: message,
      bytes: backup.bytes,
    });
    return { status: "failed", backup, message, error: message };
  }

  // Too large to attach: still tell someone, and tell them where it is. A
  // silent skip here is precisely the failure that goes unnoticed for months.
  if (backup.bytes > MAX_ATTACHMENT_BYTES) {
    const message =
      `Backup archive is ${formatBytes(backup.bytes)}, above the ` +
      `${formatBytes(MAX_ATTACHMENT_BYTES)} attachment limit. It was NOT ` +
      `attached. Collect it from ${backup.filePath} on the server.`;
    console.error(`[backup] ${message}`);

    try {
      await sendMail({
        to,
        subject: `[Restokar] Backup too large to attach — ${backup.fileName}`,
        text: `${message}\n\n${summarise(backup)}`,
      });
    } catch (error) {
      console.error("[backup] could not send the size warning either", error);
    }

    await recordBackupOutcome({
      status: "too_large",
      archived: true,
      error: message,
      bytes: backup.bytes,
    });
    return { status: "too_large", backup, message };
  }

  try {
    const messageId = await sendMail({
      to,
      subject: `[Restokar] Customer data backup — ${backup.startedAt
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")}`,
      text: summarise(backup),
      attachments: [
        {
          filename: backup.fileName,
          path: backup.filePath,
          contentType: "application/gzip",
        },
      ],
    });

    const message = `Backup emailed to ${to} (${formatBytes(backup.bytes)}).`;
    log(`[backup] ${message} messageId=${messageId}`);
    await recordBackupOutcome({
      status: "ok",
      archived: true,
      error: null,
      bytes: backup.bytes,
    });
    return { status: "ok", backup, message };
  } catch (error) {
    const detail = (error as Error)?.message ?? String(error);
    const message =
      `Backup was created but could NOT be emailed to ${to} (from ` +
      `${mailFrom() || "unset"}): ${detail}. The archive is on disk at ` +
      `${backup.filePath}.`;
    console.error(`[backup] ${message}`);
    await recordBackupOutcome({
      status: "failed",
      archived: true,
      error: message.slice(0, 500),
      bytes: backup.bytes,
    });
    return { status: "failed", backup, message, error: detail };
  }
}

/** Exposed for the admin console's "last run" indicator. */
export { formatBytes };

/** Re-exported so callers need only this module. */
export type { BackupResult };

/** Used by the CLI to size a `stat` check without importing node:fs there. */
export async function archiveSize(filePath: string): Promise<number> {
  const { size } = await stat(filePath);
  return size;
}
