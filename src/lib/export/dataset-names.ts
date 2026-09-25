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
  "pnl",
  "tables",
] as const;

export type ExportDataset = (typeof EXPORT_DATASETS)[number];

/**
 * Which datasets carry personal data.
 *
 * Only `customers` does — it contains guests' phone numbers. The route reads
 * this to require ownership rather than a staff grant, and to write an audit
 * entry. Data rather than an `if` in the route, so a dataset added later has to
 * state its answer here.
 */
export const SENSITIVE_DATASETS: ReadonlySet<ExportDataset> = new Set(["customers"]);
