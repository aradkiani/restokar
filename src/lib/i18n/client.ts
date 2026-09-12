import { fa, type Dictionary } from "./fa";
import { en } from "./en";
import type { Locale } from "./index";

/**
 * Client-safe dictionary access. `src/lib/i18n/index.ts` imports
 * `next/headers`, which cannot be pulled into a client component — this module
 * exposes the same dictionaries without that dependency.
 */
const dictionaries: Record<Locale, Dictionary> = { fa, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? fa;
}

export type { Dictionary };
