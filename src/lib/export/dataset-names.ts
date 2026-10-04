/**
 * The names of the exports, and nothing else.
 *
 * Split out from `datasets.ts` for the same reason `customers.ts` keeps
 * `MAX_PAGE_SIZE` away from `customers-server.ts`: the request schema validates
 * against this list, that schema is imported by client code, and `datasets.ts`
 * is behind a `server-only` marker. Importing the constant from there would
 * drag Prisma and every report provider into the browser bundle.
 *
 * Kept deliberately free of any import so it can be read from anywhere.
 */
export const EXPORT_DATASETS = [
  "sales",
  "orders",
  "order-items",
  "products",
  "categories",
  "customers",
  "inventory",
  "purchases",
  "pnl",
  "tables",
] as const;

export type ExportDataset = (typeof EXPORT_DATASETS)[number];

/**
 * File formats, the first being the default.
 *
 * `xlsx` is what an owner downloads: right to left, styled, and immune to the
 * delimiter a Persian-format Windows expects. `csv` stays for import tools.
 */
export const EXPORT_FORMATS = ["xlsx", "csv"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Which datasets carry personal data.
 *
 * Only `customers` does — it contains guests' phone numbers. The route reads
 * this to require ownership rather than a staff grant, and to write an audit
 * entry. Data rather than an `if` in the route, so a dataset added later has to
 * state its answer here.
 */
export const SENSITIVE_DATASETS: ReadonlySet<ExportDataset> = new Set(["customers"]);

/**
 * Datasets opened by the inventory section's grant rather than the analytics
 * one: someone who runs the shelves can take the shelves home in a file.
 */
export const INVENTORY_DATASETS: ReadonlySet<ExportDataset> = new Set([
  "inventory",
  "purchases",
]);
