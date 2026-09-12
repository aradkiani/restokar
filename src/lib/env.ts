import { z } from "zod";

/**
 * Fail fast on misconfiguration: a missing AUTH_SECRET in production is a
 * silent security hole, so it is validated at module load rather than at the
 * first request that happens to need it.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  /**
   * The public origin. Baked into every QR code at generation time, so a wrong
   * value here is not a config bug — it is a stack of reprinted table cards.
   * A trailing slash is stripped so `${APP_URL}/menu/x` can never become
   * `//menu/x`, which some scanners refuse outright.
   */
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((value) => value.replace(/\/+$/, "")),
  PAYMENT_PROVIDER: z.enum(["zarinpal", "mock"]).default("mock"),
  ZARINPAL_MERCHANT_ID: z.string().default(""),
  ZARINPAL_SANDBOX: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),

  /**
   * How many proxies of our own sit in front of the app.
   *
   * Used to pick the trustworthy entry out of `x-forwarded-for`. One for the
   * documented single-nginx deployment. Setting this too high lets a client
   * choose the address the limiter counts against, so it is a number an
   * operator states rather than something guessed from the header itself.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),

  /**
   * Root of the customer-data directory — uploads and generated backups.
   *
   * Deliberately outside the application tree so the core codebase can be
   * regenerated, replaced or redeployed wholesale without touching anything a
   * customer created. See docs/DATA-BOUNDARY.md.
   */
  DATA_DIR: z.string().min(1).default("./data"),

  // ------------------------------- backups ---------------------------------
  //
  // Plain SMTP, because it is free with any mailbox the operator already owns
  // and needs no API key, no vendor account and nothing reachable only from
  // outside Iran. The destination address is NOT here: it is edited from the
  // admin console and stored in PlatformSetting, so it can change without a
  // redeploy.
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  /** Envelope sender. Falls back to SMTP_USER, which is right for most hosts. */
  SMTP_FROM: z.string().default(""),
  /** True for implicit TLS on 465; false starts plaintext and issues STARTTLS. */
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`,
  );
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";

if (isProd && env.AUTH_SECRET.startsWith("dev-only")) {
  throw new Error(
    "Refusing to boot in production with the example AUTH_SECRET. Generate a real one.",
  );
}

if (isProd && env.PAYMENT_PROVIDER === "zarinpal" && !env.ZARINPAL_MERCHANT_ID) {
  throw new Error("PAYMENT_PROVIDER=zarinpal requires ZARINPAL_MERCHANT_ID.");
}

/**
 * Refuse to boot in production with a local or insecure public origin.
 *
 * This is the single most expensive misconfiguration in the product. The origin
 * is encoded into QR codes the moment they are generated, and those codes get
 * printed, laminated and glued to tables. Booting with the default would hand a
 * venue a stack of cards pointing at `localhost` — codes that work perfectly on
 * the owner's laptop and for nobody else, and that cannot be fixed remotely.
 *
 * Failing at startup is the kind thing to do: the alternative is discovering it
 * from a guest who cannot see the menu.
 */
if (isProd) {
  const url = new URL(env.NEXT_PUBLIC_APP_URL);
  const isLocal = ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname);

  if (isLocal) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL is ${env.NEXT_PUBLIC_APP_URL}, which only resolves on this machine. ` +
        "QR codes are generated from it and get printed, so set it to your real public https:// domain before starting in production.",
    );
  }

  if (url.protocol !== "https:") {
    throw new Error(
      `NEXT_PUBLIC_APP_URL must use https in production (got ${url.protocol}//). ` +
        "Printed QR codes cannot be changed later, and the session cookie requires a secure origin.",
    );
  }
}

/**
 * True when the configured origin cannot be reached from a guest's phone.
 *
 * Used by the QR screen to warn before anything is printed. Kept here beside
 * the production guard so both read the same rule.
 */
export function appUrlIsLocal(): boolean {
  try {
    const { hostname } = new URL(env.NEXT_PUBLIC_APP_URL);
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
  } catch {
    return true;
  }
}
