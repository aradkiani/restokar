import { prisma } from "../prisma";

/**
 * Operator-editable platform settings, stored as a single row.
 *
 * The backup destination lives here rather than in the environment because the
 * requirement is that it can be changed without touching code or redeploying —
 * an operator changes it in the admin console and the next run uses it. SMTP
 * credentials stay in the environment, where secrets belong; only the
 * destination address is data.
 *
 * A single fixed-id row rather than a key/value table: there is one platform,
 * the fields are known at compile time, and a typed column is easier to read
 * than a JSON blob that everything has to re-validate.
 */

export const SETTINGS_ID = "singleton";

export interface PlatformSettings {
  backupEmail: string | null;
  lastBackupAt: Date | null;
  lastBackupStatus: string | null;
  lastBackupError: string | null;
  lastBackupBytes: number | null;
}

/** Reads the settings row, creating it on first use. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const existing = await prisma.platformSetting.findUnique({
    where: { id: SETTINGS_ID },
  });

  if (existing) return existing;

  // upsert rather than create: two instances booting at once would otherwise
  // race on the primary key and one would throw.
  return prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
}

/** Sets the address backups are delivered to. `null` disables delivery. */
export async function setBackupEmail(email: string | null): Promise<PlatformSettings> {
  return prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, backupEmail: email },
    update: { backupEmail: email },
  });
}

/**
 * Records the outcome of a backup run.
 *
 * `lastBackupError` is cleared on success rather than left behind, so the admin
 * console shows the current state and not the most recent bad news. A failure
 * that has since been resolved must stop being reported, or the indicator gets
 * ignored — which is the failure mode that makes silent backup loss possible.
 *
 * `archived` says whether an archive actually reached the disk, and it is what
 * decides whether `lastBackupAt` moves. The two fields answer different
 * questions: the status is how the most recent *run* ended, while the timestamp
 * and size describe the newest archive that exists. A run that fell over before
 * writing anything must not advance the timestamp, or the row claims a backup
 * was taken at a moment when none was — which is the row contradicting the
 * filesystem, and the filesystem is the one telling the truth.
 *
 * Delivery failing is not the same thing. The archive is on disk either way, so
 * those paths pass `archived: true` and the timestamp moves: the backup did
 * happen, only the email did not.
 */
export async function recordBackupOutcome(outcome: {
  status: "ok" | "failed" | "not_configured" | "too_large";
  /** True when an archive was written. Only then do the timestamp and size move. */
  archived: boolean;
  error?: string | null;
  bytes?: number | null;
}): Promise<void> {
  // Kept together deliberately: both describe the same archive, so leaving one
  // behind while the other advances would trade one inconsistency for another.
  const archiveFields = outcome.archived
    ? { lastBackupAt: new Date(), lastBackupBytes: outcome.bytes ?? null }
    : {};

  await prisma.platformSetting
    .upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        lastBackupStatus: outcome.status,
        lastBackupError: outcome.error ?? null,
        ...archiveFields,
      },
      update: {
        lastBackupStatus: outcome.status,
        lastBackupError: outcome.error ?? null,
        ...archiveFields,
      },
    })
    .catch((error) => {
      // Recording the outcome must never be what fails the run.
      console.error("[backup] could not record outcome", error);
    });
}
