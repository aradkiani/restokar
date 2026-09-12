/**
 * Gateway-agnostic payment contract.
 *
 * Iranian gateways (Zarinpal, IDPay, Zibal, NextPay…) all follow the same
 * three-step shape: request a transaction, redirect the payer, then verify the
 * result server-side. Modelling that shape here means adding a second gateway
 * is a new file implementing this interface plus one line in the factory —
 * no changes to order or subscription code.
 */

export interface PaymentRequest {
  /** Whole Toman. */
  amount: number;
  description: string;
  /** Absolute URL the gateway returns the payer to. */
  callbackUrl: string;
  mobile?: string;
  email?: string;
}

export interface PaymentRequestResult {
  /** Gateway handle for the pending transaction. Persisted on Payment.authority. */
  authority: string;
  /** Where to send the payer's browser. */
  redirectUrl: string;
}

export interface PaymentVerifyResult {
  status: "PAID" | "FAILED" | "CANCELED";
  /** Bank reference for a settled payment; shown to the payer as a receipt. */
  refId?: string;
  cardPan?: string;
  message?: string;
}

export interface PaymentProvider {
  readonly name: string;
  request(input: PaymentRequest): Promise<PaymentRequestResult>;
  /** `amount` is re-sent because gateways verify against it, not against us. */
  verify(input: {
    authority: string;
    amount: number;
    status?: string;
  }): Promise<PaymentVerifyResult>;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code?: string | number,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}
