import {
  PaymentError,
  type PaymentProvider,
  type PaymentRequest,
  type PaymentRequestResult,
  type PaymentVerifyResult,
} from "./types";

/**
 * Zarinpal REST v4.
 *
 * Two details that bite implementers:
 *  1. Amounts are sent in **Rial**, while the product prices everything in
 *     Toman. The ×10 conversion happens here and nowhere else.
 *  2. A `code` of 100 means paid; 101 means "already verified". 101 must be
 *     treated as success, otherwise a duplicated callback (a refresh, a slow
 *     network retry) marks a genuinely paid order as failed.
 */
interface Endpoints {
  request: string;
  verify: string;
  startPay: string;
}

const ENDPOINTS: { production: Endpoints; sandbox: Endpoints } = {
  production: {
    request: "https://payment.zarinpal.com/pg/v4/payment/request.json",
    verify: "https://payment.zarinpal.com/pg/v4/payment/verify.json",
    startPay: "https://payment.zarinpal.com/pg/StartPay/",
  },
  sandbox: {
    request: "https://sandbox.zarinpal.com/pg/v4/payment/request.json",
    verify: "https://sandbox.zarinpal.com/pg/v4/payment/verify.json",
    startPay: "https://sandbox.zarinpal.com/pg/StartPay/",
  },
};

const TOMAN_TO_RIAL = 10;

interface ZarinpalEnvelope<T> {
  data: T | never[];
  errors: { code: number; message: string } | never[];
}

export class ZarinpalProvider implements PaymentProvider {
  readonly name = "zarinpal";
  private readonly endpoints: Endpoints;

  constructor(
    private readonly merchantId: string,
    sandbox = false,
  ) {
    this.endpoints = sandbox ? ENDPOINTS.sandbox : ENDPOINTS.production;
  }

  async request(input: PaymentRequest): Promise<PaymentRequestResult> {
    const body = {
      merchant_id: this.merchantId,
      amount: input.amount * TOMAN_TO_RIAL,
      description: input.description.slice(0, 255),
      callback_url: input.callbackUrl,
      metadata: {
        ...(input.mobile ? { mobile: input.mobile } : {}),
        ...(input.email ? { email: input.email } : {}),
      },
    };

    const payload = await this.post<{ authority: string; code: number }>(
      this.endpoints.request,
      body,
    );

    const authority = !Array.isArray(payload.data) ? payload.data.authority : undefined;
    if (!authority) {
      throw new PaymentError(this.errorMessage(payload), this.errorCode(payload));
    }

    return { authority, redirectUrl: `${this.endpoints.startPay}${authority}` };
  }

  async verify({
    authority,
    amount,
    status,
  }: {
    authority: string;
    amount: number;
    status?: string;
  }): Promise<PaymentVerifyResult> {
    // Zarinpal appends ?Status=NOK when the payer aborts at the gateway; there
    // is nothing to verify in that case.
    if (status && status.toUpperCase() !== "OK") {
      return { status: "CANCELED", message: "Payment canceled by the payer" };
    }

    const payload = await this.post<{
      code: number;
      ref_id: number;
      card_pan?: string;
      message?: string;
    }>(this.endpoints.verify, {
      merchant_id: this.merchantId,
      amount: amount * TOMAN_TO_RIAL,
      authority,
    });

    if (Array.isArray(payload.data)) {
      return { status: "FAILED", message: this.errorMessage(payload) };
    }

    const { code, ref_id, card_pan } = payload.data;
    if (code === 100 || code === 101) {
      return { status: "PAID", refId: String(ref_id), cardPan: card_pan };
    }

    return { status: "FAILED", message: payload.data.message ?? `Zarinpal code ${code}` };
  }

  private async post<T>(url: string, body: unknown): Promise<ZarinpalEnvelope<T>> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        // A hung gateway must not hold a request open indefinitely.
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new PaymentError(
        `Could not reach Zarinpal: ${(error as Error).message}`,
        "NETWORK_ERROR",
      );
    }

    const payload = (await response
      .json()
      .catch(() => null)) as ZarinpalEnvelope<T> | null;
    if (!payload)
      throw new PaymentError("Malformed response from Zarinpal", "BAD_RESPONSE");
    return payload;
  }

  private errorMessage(payload: ZarinpalEnvelope<unknown>): string {
    if (!Array.isArray(payload.errors) && payload.errors?.message)
      return payload.errors.message;
    return "Zarinpal rejected the request";
  }

  private errorCode(payload: ZarinpalEnvelope<unknown>): number | undefined {
    return !Array.isArray(payload.errors) ? payload.errors?.code : undefined;
  }
}
