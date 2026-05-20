/** Gemini model pricing — USD per 1M tokens (2026 초 기준 근사치). */

export interface ModelRate {
  inputPerM: number;
  outputPerM: number;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  "gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5 },
  "gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10 },
  "gemini-2.5-flash-lite": { inputPerM: 0.1, outputPerM: 0.4 },
};

const FALLBACK_RATE = MODEL_RATES["gemini-2.5-flash"];

/** Rough USD→KRW for display only. */
export const USD_TO_KRW = 1400;

export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const rate = MODEL_RATES[model] ?? FALLBACK_RATE;
  return (
    (tokensIn * rate.inputPerM + tokensOut * rate.outputPerM) / 1_000_000
  );
}

export function formatUsd(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

export function formatKrw(usd: number): string {
  return `₩${Math.round(usd * USD_TO_KRW).toLocaleString("ko-KR")}`;
}
