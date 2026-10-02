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
  /**
   * How old the newest backup archive may be before /api/health reports
   * degraded, in hours.
   *
   * Default 48: the schedule runs twice a day, so two missed runs is the first
   * point at which something is clearly wrong rather than merely late. Lower it
   * on a busier venue where losing half a day of orders matters more.
   *
   * This exists because the backup schedule failed for eight days in September
   * 2026 and reported it only to a log file nobody was reading.
   */
  BACKUP_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(8760).default(48),

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

  // --------------------------------- SMS -----------------------------------
  //
  // Melipayamak, reached over SOAP, for one-time codes only. Unlike every other
  // outbound call in this product it costs money per message, so the defaults
  // below are the ones that spend nothing: provider `mock` and dry run `true`.
  // Sending for real is something an operator switches on deliberately.
  //
  // Promotional messages never use these: they are paid for by the venue and
  // sent by platform staff with a separate tool. See sms-broadcast.ts.
  SMS_PROVIDER: z.enum(["melipayamak", "mock"]).default("mock"),

  /**
   * Log instead of sending, without changing anything else.
   *
   * Defaults to `true` **including in production**, which is unusual and
   * deliberate: every other misconfiguration in this file is loud, and a wrong
   * one here is silent and billed.
   */
  SMS_DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),

  MELIPAYAMAK_USERNAME: z.string().default(""),
  MELIPAYAMAK_PASSWORD: z.string().default(""),

  /**
   * The approved OTP pattern, issued by Melipayamak once the template is
   * reviewed. Zero means "not set up", and codes are skipped rather than
   * attempted — see patterns.ts. A pattern carries its own sender line, which
   * is why there is no `MELIPAYAMAK_FROM`.
   */
  SMS_PATTERN_OTP: z.coerce.number().int().min(0).default(0),

  // --------------------------- promotional SMS -------------------------------
  //
  // A venue pays for a broadcast when it submits one; platform staff send it by
  // hand. Nothing here reaches an SMS provider.

  /**
   * What the venue is charged per SMS part per recipient, in whole Toman.
   *
   * Per *part*, not per message, because that is how the line is billed: a
   * Persian text of 71 characters is two SMS, and pricing it as one would mean
   * the platform paying for the second out of its own pocket on every
   * recipient. A placeholder until the real price is decided.
   */
  SMS_PRICE_PER_PART: z.coerce.number().int().min(1).max(100_000).default(200),

  /**
   * Appended to every promotional text. A multi-recipient send without it is
   * refused by the line (code 15), so it is added to the text the venue pays
   * for and the text staff paste into the sending tool.
   */
  SMS_OPT_OUT_SUFFIX: z.string().default("لغو11"),

  // --------------------------------- OTP -----------------------------------
  /** 5 or 6: shorter is guessable within the attempt limit, longer is mistyped. */
  OTP_CODE_LENGTH: z.coerce.number().int().min(5).max(6).default(5),
  OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(120),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
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
 * A real SMS provider needs both credentials.
 *
 * Checked at boot rather than at the first send because the first send is
 * someone waiting on a verification code: discovering there that the password
 * is empty means a person staring at a code that will never arrive.
 *
 * Only when the provider is actually selected AND dry run is off, so a venue can
 * deploy with SMS switched off and fill the credentials in later.
 */
if (env.SMS_PROVIDER === "melipayamak" && !env.SMS_DRY_RUN) {
  const missing = (
    [
      ["MELIPAYAMAK_USERNAME", env.MELIPAYAMAK_USERNAME],
      ["MELIPAYAMAK_PASSWORD", env.MELIPAYAMAK_PASSWORD],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `SMS_PROVIDER=melipayamak with SMS_DRY_RUN=false requires: ${missing.join(", ")}.`,
    );
  }
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
