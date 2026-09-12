import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env; Node 22 can do it natively.
try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional when the environment is already populated (CI, Docker).
}

/**
 * CLI-side configuration (migrate, db push, studio, seed). The application
 * itself never reads this — it connects through the driver adapter in
 * src/lib/prisma.ts.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
