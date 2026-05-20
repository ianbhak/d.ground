/**
 * Gemini text generation — server-only. Streaming + non-streaming.
 *
 * Used for RAG answers. Reuses the d.connect family's Gemini key.
 */

import { fetchWithRetry } from "./fetch-retry";

const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
]);
const FALLBACK_MODEL = "gemini-2.5-flash";

export interface GenerationResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface GenerationParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

type StreamEvent = { delta: string } | { tokensIn: number; tokensOut: number };

interface GeminiStreamChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Stream a Gemini answer. Yields `{ delta }` text events as they
 * arrive, then a final `{ tokensIn, tokensOut }` usage event.
 */
export async function* streamAnswer(
  params: GenerationParams,
): AsyncGenerator<StreamEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — add it to .env.local.");
  }

  const model = ALLOWED_MODELS.has(params.model)
    ? params.model
    : FALLBACK_MODEL;

  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
        generationConfig: { temperature: params.temperature ?? 0.2 },
      }),
    },
  );

  if (!res.ok || !res.body) {
    throw new Error(
      `Gemini generation error ${res.status}: ${await res.text()}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tokensIn = 0;
  let tokensOut = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let chunk: GeminiStreamChunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const text =
        chunk.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("") ?? "";
      if (text) yield { delta: text };

      if (chunk.usageMetadata) {
        tokensIn = chunk.usageMetadata.promptTokenCount ?? tokensIn;
        tokensOut = chunk.usageMetadata.candidatesTokenCount ?? tokensOut;
      }
    }
  }

  yield { tokensIn, tokensOut };
}

/** Non-streaming convenience wrapper — collects the full stream. */
export async function generateAnswer(
  params: GenerationParams,
): Promise<GenerationResult> {
  let text = "";
  let tokensIn = 0;
  let tokensOut = 0;

  for await (const event of streamAnswer(params)) {
    if ("delta" in event) {
      text += event.delta;
    } else {
      tokensIn = event.tokensIn;
      tokensOut = event.tokensOut;
    }
  }

  return { text, tokensIn, tokensOut };
}
