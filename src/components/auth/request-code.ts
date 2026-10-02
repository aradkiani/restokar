import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import type { Dictionary } from "@/lib/i18n/fa";

export interface CodeSent {
  ok: true;
  codeLength: number;
  cooldownSeconds: number;
}

export interface CodeRefused {
  ok: false;
  error: string;
  code?: string;
  /** Present when the server said "wait": a cooldown or a rate limit. */
  retryAfterSeconds?: number;
  /** The code length, reported with a cooldown so the code box can open. */
  codeLength?: number;
  fieldErrors?: Record<string, string>;
}

/**
 * Asks the server to text a code, for any of the three phone flows.
 *
 * A cooldown is not really a failure: a code was sent moments ago and is still
 * valid, so the pages move straight to the code step and count down from the
 * seconds the server reports.
 */
export async function requestCode(
  url: string,
  body: Record<string, unknown>,
  t: Dictionary,
): Promise<CodeSent | CodeRefused> {
  const result = await api.post<{ codeLength: number; cooldownSeconds: number }>(
    url,
    body,
  );
  if (result.ok) {
    return {
      ok: true,
      codeLength: result.data.codeLength,
      cooldownSeconds: result.data.cooldownSeconds,
    };
  }

  const wait = Number(result.error.details?.retryAfterSeconds);
  const length = Number(result.error.details?.codeLength);
  return {
    ok: false,
    error: localizeApiError(result.error, t),
    code: result.error.code,
    retryAfterSeconds: Number.isFinite(wait) && wait > 0 ? wait : undefined,
    codeLength: Number.isInteger(length) && length > 0 ? length : undefined,
    fieldErrors:
      result.error.code === "VALIDATION_ERROR" ? result.error.details : undefined,
  };
}
