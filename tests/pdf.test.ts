import { describe, it, expect } from "vitest";
import { extractPdfPages } from "../src/lib/pdf";

/**
 * Minimal valid PDF with one page containing the text
 * "d ground test pdf". No xref table — pdf.js rebuilds it.
 */
function minimalPdf(): Uint8Array {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 52 >>
stream
BT /F1 18 Tf 20 100 Td (d ground test pdf) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R /Size 6 >>
%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("extractPdfPages", () => {
  it("returns one string per page", async () => {
    const pages = await extractPdfPages(minimalPdf());
    expect(Array.isArray(pages)).toBe(true);
    expect(pages).toHaveLength(1);
  });

  it("extracts the page text", async () => {
    const [page] = await extractPdfPages(minimalPdf());
    expect(page.toLowerCase()).toContain("ground");
  });
});
