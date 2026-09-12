import nodemailer from "nodemailer";
import { env } from "../env";

/**
 * Plain SMTP delivery.
 *
 * SMTP rather than a transactional-email API: any mailbox the operator already
 * owns will do, there is no account to open, no key to rotate, no per-message
 * cost, and nothing that has to be reachable from outside Iran. Nodemailer is
 * the one dependency, and it only speaks the protocol — it calls no service of
 * its own.
 *
 * Credentials come from the environment. The *destination* does not: that is
 * edited in the admin console and stored in the database, because the operator
 * has to be able to change where backups land without a redeploy.
 */

export interface MailAttachment {
  filename: string;
  path: string;
  contentType?: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}

/** True when enough is configured to attempt delivery at all. */
export function mailerConfigured(): boolean {
  return env.SMTP_HOST.trim().length > 0;
}

export function mailFrom(): string {
  return env.SMTP_FROM.trim() || env.SMTP_USER.trim();
}

function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Implicit TLS on 465; otherwise start plaintext and upgrade via STARTTLS.
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // A backup job must not hang a scheduled run forever on an unreachable
    // host; failing after a minute is recoverable, blocking indefinitely is not.
    connectionTimeout: 60_000,
    greetingTimeout: 30_000,
    socketTimeout: 120_000,
    // STARTTLS is required rather than opportunistic: this message carries
    // password hashes and customer records, and silently downgrading to
    // plaintext because a server did not advertise the extension is not an
    // acceptable outcome. `secure: true` already implies TLS from the start.
    requireTLS: !env.SMTP_SECURE,
  });
}

/**
 * Sends one message, throwing on failure.
 *
 * Deliberately not swallowing errors: the caller records the failure against
 * the platform settings so it shows up in the admin console, and a silent
 * catch here would defeat that.
 */
export async function sendMail(input: SendMailInput): Promise<string> {
  if (!mailerConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST (and usually SMTP_USER / SMTP_PASSWORD) in the environment.",
    );
  }

  const from = mailFrom();
  if (!from) {
    throw new Error("No sender address. Set SMTP_FROM or SMTP_USER.");
  }

  const transport = createTransport();
  try {
    const info = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments,
    });
    return info.messageId;
  } finally {
    // Releases the connection pool; without it a CLI run can hang after the
    // send completes, which looks exactly like a delivery that never finished.
    transport.close();
  }
}
