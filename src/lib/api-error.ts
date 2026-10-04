"use client";

import type { Dictionary } from "./i18n/fa";
import type { ApiFailure } from "./client-api";

/**
 * Turns an API failure into text a person can act on, in their own language.
 *
 * The server answers with a stable `code` and an untranslated fallback
 * message. Rendering happens here so one endpoint can serve a Persian and an
 * English user without the route knowing which is which — previously the
 * routes hard-coded Persian, and a validation failure surfaced Zod's English
 * "Validation failed" to everyone regardless of locale.
 */
export function localizeApiError(error: ApiFailure["error"], t: Dictionary): string {
  const codes = t.errors.codes as Record<string, string | undefined>;
  const byCode = error.code ? codes[error.code] : undefined;
  // "{name}" in a message is filled from the error's details, so a guest reads
  // «لاته» امروز تمام شده است rather than a sentence with a hole in it.
  if (byCode) return byCode.replace("{name}", error.details?.name ?? "");

  // Unknown code: prefer the server's message over an empty banner, but never
  // show a bare internal string like "Validation failed".
  if (error.message && error.message !== "Validation failed") return error.message;
  return t.common.error;
}

/**
 * Field-level messages for inline display. Zod's own "expected string,
 * received undefined" is developer output, not user copy, so anything that
 * still looks like a raw type error is replaced with a plain required message.
 */
export function localizeFieldErrors(
  details: Record<string, string> | undefined,
  t: Dictionary,
): Record<string, string> {
  if (!details) return {};

  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(details)) {
    out[field] = isRawZodMessage(message) ? t.errors.required : message;
  }
  return out;
}

/**
 * Zod's built-in English text is developer output. Schemas in
 * src/lib/validation.ts supply their own copy, but this is the backstop so a
 * validator added without a message can never surface strings like
 * "Too small: expected number to be >=0" in the UI.
 */
function isRawZodMessage(message: string): boolean {
  return (
    /^(Required|Invalid input|Invalid|Too small|Too big|Expected)\b/i.test(message) ||
    /expected .+(, received| to be)/i.test(message)
  );
}
