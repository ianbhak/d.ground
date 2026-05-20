/**
 * Gemini text generation — server-only.
 *
 * Used for RAG answers. Reuses the d.connect family's Gemini key.
 */

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

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export async function generateAnswer(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<GenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — add it to .env.local.");
  }

  const model = ALLOWED_MODELS.has(params.model)
    ? params.model
    : FALLBACK_MODEL;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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

  if (!res.ok) {
    throw new Error(
      `Gemini generation error ${res.status}: ${await res.text()}`,
    );
  }

  const json = (await res.json()) as GeminiGenerateResponse;
  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";

  return {
    text,
    tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
