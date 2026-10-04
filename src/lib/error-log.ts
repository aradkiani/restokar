import "server-only";
import { prisma } from "./prisma";
import {
  MAX_MESSAGE,
  MAX_STACK,
  clip,
  fingerprintOf,
  maskPath,
  scrubText,
} from "./error-shape";

/**
 * The platform's own error log: what broke, where, how often.
 *
 * Grouped by fingerprint, so a page failing a thousand times is one row with a
 * count of a thousand rather than a thousand rows. Never throws — reporting a
 * failure must not become a second failure — and always also writes to the
 * process log, so an outage of the database itself still leaves a trace.
 *
 * No outside service: everything stays on the platform's own server, which is
 * both the simplest thing that works and the one that keeps guests' data at
 * home. Swapping in Sentry later means changing this one file.
 */

/** Rows not seen for this long are pruned; the log is for what is happening now. */
const RETENTION_DAYS = 30;

export interface ErrorReport {
  source: "SERVER" | "CLIENT";
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  /** render | route | action | proxy | browser */
  context?: string | null;
  digest?: string | null;
  userAgent?: string | null;
}

export async function recordError(report: ErrorReport): Promise<void> {
  const message = clip(scrubText(report.message || "Unknown error"), MAX_MESSAGE)!;
  const path = maskPath(report.path);
  const fingerprint = fingerprintOf({
    source: report.source,
    message,
    path,
    context: report.context,
  });
  console.error(`[error-log] ${report.source} ${path ?? ""} ${message}`);

  try {
    const now = new Date();
    await prisma.errorEvent.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        source: report.source,
        message,
        stack: clip(report.stack ? scrubText(report.stack) : null, MAX_STACK),
        path,
        method: clip(report.method, 10),
        context: clip(report.context, 40),
        digest: clip(report.digest, 80),
        userAgent: clip(report.userAgent, 200),
      },
      // A resolved error that comes back is open again.
      update: { count: { increment: 1 }, lastSeenAt: now, resolvedAt: null },
    });

    // Pruned now and then rather than on a schedule: one extra delete on a
    // small fraction of writes keeps the table small with nothing to run.
    if (Math.random() < 0.02) {
      await prisma.errorEvent.deleteMany({
        where: {
          lastSeenAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) },
        },
      });
    }
  } catch (error) {
    console.error("[error-log] could not record", error);
  }
}
