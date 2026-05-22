import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { fetchWithRetry } from "./fetch-retry";

/**
 * Plain text extraction, one string per page (unpdf, pure JS).
 * Fast and free, but loses table structure and ignores images.
 * Kept as the fallback for vision extraction.
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

const VISION_PROMPT = `Extract ALL content from this PDF as clean Markdown.
- Preserve tables as Markdown tables.
- For figures, charts, and diagrams, output a line beginning with
  "[FIGURE] " followed by a concise description of what they show,
  including any data points, labels, or values.
- OCR any text that is part of an image or a scanned page.
- At the start of each page output a line exactly: "--- page N ---"
  where N is the page number.
- Output only the document content — no preamble, no commentary.`;

function splitByPageMarker(markdown: string): string[] {
  const pages = markdown
    .split(/^---\s*page\s*\d+\s*---\s*$/im)
    .map((p) => p.trim())
    .filter(Boolean);
  return pages.length > 0 ? pages : [markdown.trim()];
}

// Gemini's inline-data request cap is ~20 MB; base64 inflates the
// payload by a third, so only PDFs comfortably under that go through
// vision extraction. Larger files fall back to plain text (Phase 2
// will route them through the Gemini Files API instead).
const VISION_INLINE_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Vision extraction — sends the PDF straight to Gemini, which reads
 * text, tables, figures, charts, and scanned content, and returns
 * structured Markdown. Falls back to plain text extraction if the
 * Gemini call is unavailable, fails, or the file is too large to send
 * inline.
 *
 * Server-only.
 */
export async function extractPdfContent(bytes: Uint8Array): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && bytes.byteLength <= VISION_INLINE_MAX_BYTES) {
    try {
      const base64 = Buffer.from(bytes).toString("base64");
      const res = await fetchWithRetry(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: "application/pdf",
                      data: base64,
                    },
                  },
                  { text: VISION_PROMPT },
                ],
              },
            ],
            generationConfig: { temperature: 0, maxOutputTokens: 32768 },
          }),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const markdown =
          json.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? "";
        if (markdown.trim()) return splitByPageMarker(markdown);
      }
    } catch {
      // Vision extraction failed — fall through to plain text.
    }
  }
  return extractPdfPages(bytes);
}

/**
 * 1-based page numbers whose extracted Markdown contains a table or a
 * figure. A thumbnail is only worth showing for these pages — a
 * thumbnail of a plain-text page tells the reader nothing.
 *
 * Figures are detected via the "[FIGURE]" marker the vision prompt
 * emits; tables via a Markdown table separator row. The plain-text
 * extraction fallback has neither, so it simply yields no visual pages.
 */
export function detectVisualPages(pages: string[]): number[] {
  const TABLE_SEPARATOR = /^[ \t]*\|?[ \t:|-]*-{3,}[ \t:|-]*\|[ \t:|-]*$/m;
  const result: number[] = [];
  pages.forEach((markdown, i) => {
    if (markdown.includes("[FIGURE]") || TABLE_SEPARATOR.test(markdown)) {
      result.push(i + 1);
    }
  });
  return result;
}

const THUMB_WIDTH = 480; // px — small enough for an inline citation thumbnail

/**
 * Render a single PDF page to a small PNG thumbnail. Returns null if
 * the page number is out of range. Server-only.
 *
 * Used by /api/figures to render cited-page previews lazily — only
 * the pages an answer actually cites are ever rasterised.
 *
 * pdf.js detaches the buffer it parses, so callers should pass a copy
 * if they still need the bytes afterwards.
 */
export async function renderPageThumbnail(
  bytes: Uint8Array,
  page: number,
): Promise<ArrayBuffer | null> {
  const pdf = await getDocumentProxy(bytes);
  if (page < 1 || page > pdf.numPages) return null;
  return renderPageAsImage(pdf, page, {
    width: THUMB_WIDTH,
    canvasImport: () => import("@napi-rs/canvas"),
  });
}

/**
 * Render several PDF pages to small PNG thumbnails in a single pass —
 * used to pre-render table/figure-page thumbnails at index time. Pages
 * out of range are skipped. Server-only.
 *
 * pdf.js detaches the buffer it parses, so callers should pass a copy
 * if they still need the bytes afterwards.
 */
export async function renderPageThumbnails(
  bytes: Uint8Array,
  pages: number[],
): Promise<Map<number, ArrayBuffer>> {
  const out = new Map<number, ArrayBuffer>();
  if (pages.length === 0) return out;
  const pdf = await getDocumentProxy(bytes);
  for (const page of pages) {
    if (page < 1 || page > pdf.numPages) continue;
    out.set(
      page,
      await renderPageAsImage(pdf, page, {
        width: THUMB_WIDTH,
        canvasImport: () => import("@napi-rs/canvas"),
      }),
    );
  }
  return out;
}
