import type { Metadata } from "next";
import { requirePageAdmin } from "@/lib/auth/guards";
import { getPlatformSettings } from "@/lib/backup/settings";
import { mailerConfigured } from "@/lib/backup/mailer";
import { BackupSettingsForm } from "./form";

export const metadata: Metadata = { title: "تنظیمات" };
export const dynamic = "force-dynamic";

/**
 * Platform settings.
 *
 * Exists because the backup destination has to be changeable by whoever runs
 * the platform, without a redeploy and without editing a file on the server.
 * SMTP credentials stay in the environment — those are secrets — and the page
 * reports whether they are present so an operator can tell "no address set"
 * apart from "address set but the mail server was never configured", which are
 * the two ways this silently fails to deliver.
 */
export default async function AdminSettingsPage() {
  await requirePageAdmin();
  const settings = await getPlatformSettings();

  return (
    <BackupSettingsForm
      initialEmail={settings.backupEmail ?? ""}
      smtpConfigured={mailerConfigured()}
      lastBackupAt={settings.lastBackupAt?.toISOString() ?? null}
      lastBackupStatus={settings.lastBackupStatus}
      lastBackupError={settings.lastBackupError}
      lastBackupBytes={settings.lastBackupBytes}
    />
  );
}
