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
 */
export async function recordBackupOutcome(outcome: {
  status: "ok" | "failed" | "not_configured" | "too_large";
  error?: string | null;
  bytes?: number | null;
}): Promise<void> {
  await prisma.platformSetting
    .upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        lastBackupAt: new Date(),
        lastBackupStatus: outcome.status,
        lastBackupError: outcome.error ?? null,
        lastBackupBytes: outcome.bytes ?? null,
      },
      update: {
        lastBackupAt: new Date(),
        lastBackupStatus: outcome.status,
        lastBackupError: outcome.error ?? null,
        lastBackupBytes: outcome.bytes ?? null,
      },
    })
    .catch((error) => {
      // Recording the outcome must never be what fails the run.
      console.error("[backup] could not record outcome", error);
    });
}
