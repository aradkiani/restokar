import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The dark theme, checked as data rather than by eye.
 *
 * Every bug this file guards against was reported by a real operator working an
 * evening shift, and every one of them was invisible on a developer's screen in
 * light mode. They came in three shapes:
 *
 *   1. **A token used for two opposite jobs.** `bg-ink-900` is a near-black chip
 *      in light mode and a near-*white* one in dark, because the ink scale
 *      inverts. Pairing it with a literal `text-white` gave 1.11:1 — a white
 *      button with white text on the order board.
 *   2. **A palette that never inverts at all.** `text-emerald-700` and friends
 *      come from Tailwind's default scale, so they stayed dark-on-dark: the
 *      profit column sat at 2.16:1.
 *   3. **Two blocks drifting.** The dark palette is declared twice — once for
 *      an explicit choice, once inside `prefers-color-scheme` for "system" — and
 *      a value fixed in one is trivially forgotten in the other.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(`${here}../app/globals.css`, "utf8");

/** Custom-property declarations inside the first block matching `header`. */
function declarationsAfter(header: string): Record<string, string> {
  const start = css.indexOf(header);
  expect(start, `missing block: ${header}`).toBeGreaterThan(-1);

  // Walk braces from the block's opening one so a nested rule cannot end it early.
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = css.slice(open, end);
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)) {
    out[match[1]!] = match[2]!.trim();
  }
  return out;
}

const explicit = declarationsAfter('[data-theme="dark"] {');
const system = declarationsAfter('[data-theme="system"] {');

// ------------------------------- contrast ----------------------------------

function luminance(hex: string): number {
  const s = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const token = (name: string) => {
  const value = explicit[name];
  expect(value, `dark theme does not define ${name}`).toBeDefined();
  return value!;
};

describe("dark palette — the two blocks stay in step", () => {
  /**
   * The explicit choice and the system-following block must declare exactly the
   * same properties. Anything in one and not the other is a value that was
   * fixed for people who picked "dark" and left broken for everyone on "system"
   * — which, since system is the default, is most of them.
   */
  it("declares the same set of tokens in both", () => {
    expect(Object.keys(explicit).sort()).toEqual(Object.keys(system).sort());
  });

  it("gives every token the same value in both", () => {
    for (const [name, value] of Object.entries(explicit)) {
      expect(system[name], name).toBe(value);
    }
  });
});

describe("dark palette — text clears WCAG AA on a card", () => {
  const surface = token("--color-surface");

  /** Body text and the muted steps that carry secondary labels and icons. */
  it.each([
    ["--color-ink-900", 4.5],
    ["--color-ink-800", 4.5],
    ["--color-ink-700", 4.5],
    ["--color-ink-600", 4.5],
    ["--color-ink-500", 4.5],
    ["--color-ink-400", 4.5],
  ])("%s reads on the card surface", (name, need) => {
    expect(contrast(token(name), surface)).toBeGreaterThanOrEqual(need);
  });

  /**
   * The status palettes. These are Tailwind defaults used semantically —
   * profit, loss, warnings — and until they were re-pointed they were dark
   * ink on a dark card.
   */
  it.each([
    "--color-emerald-600",
    "--color-emerald-700",
    "--color-emerald-800",
    "--color-red-600",
    "--color-red-700",
    "--color-red-800",
    "--color-amber-700",
    "--color-amber-800",
    "--color-amber-900",
    "--color-orange-900",
    "--color-rose-600",
  ])("%s reads on the card surface", (name) => {
    expect(contrast(token(name), surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dark palette — structure is visible", () => {
  /**
   * `ink-100` was byte-identical to `--color-surface`, so `divide-ink-100` row
   * rules and `bg-ink-100` chips on a card rendered as nothing at all. A
   * divider does not need text contrast, but it does need to exist.
   */
  it("separates the chip and divider steps from the card", () => {
    const surface = token("--color-surface");
    expect(token("--color-ink-100")).not.toBe(surface);
    expect(contrast(token("--color-ink-200"), surface)).toBeGreaterThan(1.35);
  });

  it("keeps the ink scale monotonically lighter", () => {
    const steps = [
      "--color-ink-100",
      "--color-ink-200",
      "--color-ink-300",
      "--color-ink-400",
      "--color-ink-500",
      "--color-ink-600",
      "--color-ink-700",
      "--color-ink-800",
      "--color-ink-900",
    ].map((name) => luminance(token(name)));

    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!, `step ${i}`).toBeGreaterThan(steps[i - 1]!);
    }
  });
});

describe("destructive buttons do not follow the theme", () => {
  /**
   * `--color-danger` exists precisely so the red *scale* can invert for text.
   * If it were ever re-pointed in a dark block, every delete button would
   * become pale pink carrying white text.
   */
  it("is not redefined in either dark block", () => {
    expect(explicit["--color-danger"]).toBeUndefined();
    expect(system["--color-danger"]).toBeUndefined();
  });

  it("carries its own foreground at AA", () => {
    const light = declarationsAfter("@theme {");
    const bg = light["--color-danger"];
    const fg = light["--color-danger-fg"];

    expect(bg, "--color-danger must be defined in @theme").toBeDefined();
    expect(contrast(bg!, fg!)).toBeGreaterThanOrEqual(4.5);
  });
});
