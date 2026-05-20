import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract text from a PDF, one string per page.
 * Server-only — uses unpdf (pure JS, no native deps).
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}
