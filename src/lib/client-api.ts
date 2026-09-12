"use client";

/**
 * Thin client for our own JSON API. Every route answers with
 * `{ ok, data }` or `{ ok: false, error }`, so one helper can turn both into a
 * typed result instead of each form re-implementing the same branching.
 */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: { message: string; code?: string; details?: Record<string, string> };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};

  try {
    const response = await fetch(url, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });

    const payload = (await response.json().catch(() => null)) as ApiResult<T> | null;

    if (!payload) {
      return {
        ok: false,
        error: { message: "پاسخ نامعتبر از سرور", code: "BAD_RESPONSE" },
      };
    }
    return payload;
  } catch {
    return {
      ok: false,
      error: { message: "ارتباط با سرور برقرار نشد", code: "NETWORK_ERROR" },
    };
  }
}

export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: "POST", json }),
  patch: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: "PATCH", json }),
  put: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: "PUT", json }),
  del: <T>(url: string) => apiFetch<T>(url, { method: "DELETE" }),
};
