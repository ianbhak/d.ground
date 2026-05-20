/**
 * Text embedding client — server-only. Backed by Google Gemini.
 *
 * Model: gemini-embedding-001, truncated to 1536 dims (Matryoshka)
 * and L2-normalized. 1536 stays within pgvector's HNSW 2000-dim index
 * limit while giving higher fidelity than 768.
 *
 * Reuses the d.connect family's existing Gemini API key — no new vendor.
 */

import { fetchWithRetry } from "./fetch-retry";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents";
const MODEL = "models/gemini-embedding-001";

export const EMBEDDING_DIM = 1536;
const BATCH = 100; // batchEmbedContents request cap

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

interface BatchEmbedResponse {
  embeddings: { values: number[] }[];
}

/** L2-normalize — required for truncated Gemini embeddings. */
function normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  return norm > 0 ? v.map((x) => x / norm) : v;
}

export async function embedTexts(
  texts: string[],
  taskType: TaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set — add it to .env.local (https://aistudio.google.com/apikey).",
    );
  }

  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await fetchWithRetry(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: MODEL,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBEDDING_DIM,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Gemini embedding error ${res.status}: ${await res.text()}`,
      );
    }

    const json = (await res.json()) as BatchEmbedResponse;
    out.push(...json.embeddings.map((e) => normalize(e.values)));
  }

  return out;
}

/** Embed a single query string for similarity search. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text], "RETRIEVAL_QUERY");
  return vec;
}
