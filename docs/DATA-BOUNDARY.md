# The core / customer-data boundary

This project is split so that **everything in the core project can be
regenerated, rewritten or replaced wholesale without touching a single thing a
customer owns.**

If you are an AI or a developer asked to "rebuild the site", "regenerate the
templates" or "rewrite the project", the rule is:

> Everything under **Core project** may be changed freely.
> Nothing under **Customer data** may be read, moved, rewritten or deleted.

---

## The layout

The split is a directory boundary, so that replacing the application is one
operation and cannot accidentally include customer data:

```
menuland/
├── core/     ← this folder. The whole application. Delete and replace freely.
└── data/     ← customer files. Never touched by an update.
```

`core/` is what a new release replaces, in full. `data/` sits _beside_ it, never
inside it, which is what makes "delete the old folder, unpack the new one" a
safe instruction rather than a dangerous one.

## Core project — safe to regenerate

Everything inside `core/`:

| Path                   | What it is                                          |
| ---------------------- | --------------------------------------------------- |
| `src/`                 | All application code, templates, components, libs   |
| `prisma/schema.prisma` | The data model                                      |
| `prisma/migrations/`   | Schema history                                      |
| `prisma/seed*.ts`      | Demo/test data generators                           |
| `public/`              | Fonts and static assets shipped **with the code**   |
| `scripts/`             | Operational tooling                                 |
| `docs/`                | This documentation                                  |
| root config files      | `package.json`, `next.config.ts`, `tsconfig.json` … |

None of these contain customer data. Deleting the whole folder and regenerating
it loses nothing a customer created.

The one file inside `core/` worth keeping across an update is **`.env`** — it is
configuration rather than code (database URL, auth secret, mail credentials) and
is deliberately excluded from release bundles so a new one cannot overwrite it.

---

## Customer data — never touch

There are exactly **two** stores, and neither is inside the application tree.

### 1. The PostgreSQL database

Menus, categories, products, product options, orders, order history, expenses,
payments, tables, staff calls, users, subscriptions and the audit log are
**database rows**, not files. They live in PostgreSQL, addressed by
`DATABASE_URL`.

This is worth stating plainly because it is the most common misunderstanding
about this codebase: _a restaurant's menu is not a file anywhere in this
repository._ There is no per-tenant folder of menu JSON to preserve, and adding
one would mean rewriting the entire data layer. The separation is already
absolute — the database is a different system from the code.

The schema is core (it comes back with the code); the **rows are not**.

### 2. `DATA_DIR` — customer files

Set by the `DATA_DIR` environment variable. Defaults to `../data` — the sibling
of `core/` — and should be an absolute path on its own volume in production
(`/var/lib/menuland` is the documented choice).

```
$DATA_DIR/
├── uploads/          customer-uploaded images, one directory per restaurant id
│   └── <restaurantId>/<random>.jpg
├── backups/          generated backup archives
├── snapshots/        database dumps taken before migrations
└── logs/             scheduled-job output
```

Two of these were previously inside the application tree, and both were real
hazards:

- `uploads/` lived at `public/uploads`, one directory from the bundled fonts and
  inside the folder a deployment replaces. That made "regenerate the core
  project" and "keep the customers' photos" the same operation.
- `snapshots/` lived at `./.snapshots` and had grown to **200MB of real customer
  rows** sitting in the code folder.

Both were moved out. The public URL for uploads was deliberately left unchanged
— see below.

---

## The URL contract

Uploaded images are still served at **`/uploads/<restaurantId>/<file>`**.

That path is not cosmetic. It is stored verbatim in the database on:

- `Product.imageUrl`
- `Category.iconUrl`
- `Restaurant.logoUrl`
- `Restaurant.coverUrl`
- `Restaurant.theme.backgroundImage` (and hard-coded into the validation regex
  in `src/lib/theme.ts`)

Changing the URL would mean rewriting every one of those columns. Moving the
bytes while keeping the URL made this a storage change instead of a data
migration. `src/app/uploads/[...path]/route.ts` serves them from `DATA_DIR`;
in production nginx should serve the directory directly (see `DEPLOY.md`).

**If you regenerate the core project, keep that route and keep that URL shape.**

---

## Checklist before regenerating core code

1. `DATA_DIR` is outside the directory you are about to replace.
2. `/uploads/<restaurantId>/<file>` still resolves — either via
   `src/app/uploads/[...path]/route.ts` or an nginx alias.
3. `src/lib/storage/paths.ts` still resolves paths under `DATA_DIR`.
4. The `backgroundImage` regex in `src/lib/theme.ts` still accepts `/uploads/…`.
5. Take a backup first: `npm run backup`.
