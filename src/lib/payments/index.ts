import "server-only";
import { env, isProd } from "../env";
import { ZarinpalProvider } from "./zarinpal";
import { MockProvider } from "./mock";
import type { PaymentProvider } from "./types";

let cached: PaymentProvider | null = null;

/**
 * Resolves the configured gateway. Adding another Iranian PSP means writing a
 * class against PaymentProvider and adding a case here.
 */
export function createPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  switch (env.PAYMENT_PROVIDER) {
    case "zarinpal":
      if (!env.ZARINPAL_MERCHANT_ID) {
        throw new Error("ZARINPAL_MERCHANT_ID is not configured");
      }
      cached = new ZarinpalProvider(env.ZARINPAL_MERCHANT_ID, env.ZARINPAL_SANDBOX);
      break;

    case "mock":
      // Real money must never be settled by a fake gateway.
      if (isProd) {
        throw new Error(
          "PAYMENT_PROVIDER=mock is refused in production. Configure a real gateway.",
        );
      }
      cached = new MockProvider();
      break;

    default:
      throw new Error(`Unknown payment provider: ${env.PAYMENT_PROVIDER}`);
  }

  return cached;
}

export * from "./types";
