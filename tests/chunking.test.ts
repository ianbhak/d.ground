import { describe, it, expect } from "vitest";
import { chunkText, chunkDocument } from "../src/lib/chunking";

const para = (n: number, label: string) =>
  Array.from({ length: n }, () => label).join(" ");

describe("chunkText", () => {
  it("returns nothing for empty/whitespace text", () => {
    expect(chunkText("", 1, 0)).toEqual([]);
    expect(chunkText("   \n\n  ", 1, 0)).toEqual([]);
  });

  it("keeps a short page as a single chunk", () => {
    const chunks = chunkText("짧은 문단입니다.", 3, 0);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, page: 3 });
  });

  it("splits long text into multiple chunks under the size cap", () => {
    // 5 paragraphs of ~900 chars each → must split
    const text = Array.from({ length: 5 }, (_, i) =>
      para(150, `p${i}`),
    ).join("\n\n");
    const chunks = chunkText(text, 1, 0);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(2000);
    }
  });

  it("continues the global index from startIndex", () => {
    const chunks = chunkText("문단.", 2, 7);
    expect(chunks[0].index).toBe(7);
  });

  it("hard-splits a single oversized paragraph", () => {
    const huge = "가".repeat(6000);
    const chunks = chunkText(huge, 1, 0);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(2000);
    }
  });
});

describe("chunkDocument", () => {
  it("assigns page numbers and a continuous global index", () => {
    const chunks = chunkDocument(["1쪽 내용", "2쪽 내용", "3쪽 내용"]);
    expect(chunks.map((c) => c.page)).toEqual([1, 2, 3]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("skips blank pages without breaking the index", () => {
    const chunks = chunkDocument(["내용 있음", "   ", "또 내용"]);
    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
    expect(chunks.map((c) => c.page)).toEqual([1, 3]);
  });
});
