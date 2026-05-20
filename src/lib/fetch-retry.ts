/**
 * fetch() with exponential backoff for transient upstream failures.
 *
 * Gemini (and most APIs) return 429 (rate limit) or 503 ("model
 * overloaded") under load — these are temporary and succeed on retry.
 */

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 600;

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let res: Response | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch(url, init);

    if (res.ok || !RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) {
      return res;
    }

    // 600ms → 1.2s → 2.4s
    await new Promise((r) =>
      setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)),
    );
  }

  return res!;
}
