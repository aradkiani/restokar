import { auditAllPalettes, PALETTES } from "../src/lib/palettes";
const rows = auditAllPalettes();
const f = (n: number) => n.toFixed(2).padStart(6);
console.log("id".padEnd(16), "txt/surf", "txt/bg", " muted", "  prim", " label", " PASS");
for (const r of rows) {
  console.log(
    r.id.padEnd(16),
    f(r.textOnSurface),
    f(r.textOnBackground),
    f(r.mutedOnSurface),
    f(r.primaryOnSurface),
    f(r.primaryLabel),
    r.passes ? "  OK" : "  FAIL",
  );
}
const bad = rows.filter((r) => !r.passes);
console.log(
  bad.length === 0
    ? `\nAll ${PALETTES.length} palettes pass WCAG AA.`
    : `\nFAILING: ${bad.map((b) => b.id).join(", ")}`,
);
