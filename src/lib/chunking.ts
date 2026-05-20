/**
 * Paragraph-aware text chunking for RAG indexing.
 *
 * Targets ~500 tokens / ~50 token overlap. Tokens are approximated as
 * 4 chars (good enough for chunk sizing — exact counts come later from
 * the embedding API response).
 */

export interface TextChunk {
  content: string;
  index: number; // global, document-wide
  page: number | null; // 1-based page number, null if unknown
}

const MAX_CHARS = 2000; // ≈ 500 tokens
const OVERLAP_CHARS = 200; // ≈ 50 tokens

function tail(s: string, n: number): string {
  return s.length <= n ? s : s.slice(s.length - n);
}

/** Chunk a single page's text. `startIndex` continues a document-wide counter. */
export function chunkText(
  text: string,
  page: number | null,
  startIndex: number,
): TextChunk[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let buf = "";

  const flush = () => {
    const content = buf.trim();
    if (content) {
      chunks.push({ content, index: startIndex + chunks.length, page });
    }
  };

  for (const para of paragraphs) {
    if (buf && buf.length + para.length + 2 > MAX_CHARS) {
      flush();
      buf = tail(buf, OVERLAP_CHARS) + "\n\n" + para;
    } else {
      buf = buf ? buf + "\n\n" + para : para;
    }

    // A single paragraph larger than MAX_CHARS — hard-split it.
    while (buf.length > MAX_CHARS) {
      const slice = buf.slice(0, MAX_CHARS);
      chunks.push({ content: slice, index: startIndex + chunks.length, page });
      buf = tail(slice, OVERLAP_CHARS) + buf.slice(MAX_CHARS);
    }
  }
  flush();
  return chunks;
}

/** Chunk a whole document given its per-page text. */
export function chunkDocument(pages: string[]): TextChunk[] {
  const all: TextChunk[] = [];
  pages.forEach((pageText, i) => {
    all.push(...chunkText(pageText, i + 1, all.length));
  });
  return all;
}
