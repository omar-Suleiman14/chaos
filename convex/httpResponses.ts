import type { ApiResult } from "./integrations";

export function respond(result: ApiResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(result.headers ?? {}) },
  });
}

export function error(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>): Response {
  return respond({ status, body: { error: details === undefined ? { code, message } : { code, message, details } }, headers });
}

