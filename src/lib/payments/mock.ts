import { randomToken } from "../utils";
import type {
  PaymentProvider,
  PaymentRequest,
  PaymentRequestResult,
  PaymentVerifyResult,
} from "./types";

/**
 * Development driver. Exercises the full redirect + callback round trip
 * against a local page instead of a bank, so ordering and subscription flows
 * can be tested end-to-end without merchant credentials.
 *
 * Refuses to load in production — see createPaymentProvider().
 */
export class MockProvider implements PaymentProvider {
  readonly name = "mock";

  async request(input: PaymentRequest): Promise<PaymentRequestResult> {
    const authority = `MOCK-${randomToken(12).toUpperCase()}`;
    const url = new URL("/payment/mock", input.callbackUrl);
    url.searchParams.set("authority", authority);
    url.searchParams.set("amount", String(input.amount));
    url.searchParams.set("callback", input.callbackUrl);

    return { authority, redirectUrl: url.toString() };
  }

  async verify({
    status,
  }: {
    authority: string;
    amount: number;
    status?: string;
  }): Promise<PaymentVerifyResult> {
    if (status && status.toUpperCase() !== "OK") {
      return { status: "CANCELED", message: "Payment canceled (mock)" };
    }
    return {
      status: "PAID",
      refId: randomToken(6).toUpperCase(),
      cardPan: "6037-****-****-1234",
    };
  }
}
