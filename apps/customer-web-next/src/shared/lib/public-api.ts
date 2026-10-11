import { apiBaseUrl } from "./server-api";
import { boundedFetch } from "./bounded-fetch";

export async function publicApiFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  if (!path.startsWith("/") || path.includes("..") || /[\r\n]/.test(path)) {
    throw new Error("Invalid public API path");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await boundedFetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
      cache: "no-store",
      signal: controller.signal,
    }, timeoutMs);
  } finally {
    clearTimeout(timeout);
  }
}
