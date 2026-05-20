import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embedTexts, EMBEDDING_DIM } from "../src/lib/embedding";

/**
 * W2 indexing integration tests — hits the real Gemini embedding API
 * and the real Supabase DB. Verifies the embedding client and that
 * migration 0012 (1536-dim chunks.embedding) is applied.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const dot = (a: number[], b: number[]) =>
  a.reduce((s, x, i) => s + x * b[i], 0);

describe("W2 — Gemini embeddings", () => {
  it("embeds text into 1536-dim vectors", async () => {
    const vecs = await embedTexts([
      "문서에 발 디딘 대화",
      "grounded RAG chatbot",
    ]);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toHaveLength(EMBEDDING_DIM);
    expect(vecs[1]).toHaveLength(EMBEDDING_DIM);
  });

  it("returns L2-normalized vectors", async () => {
    const [v] = await embedTexts(["정규화 확인용 문장"]);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 2);
  });

  it("places similar texts closer than unrelated ones", async () => {
    const [a, b, c] = await embedTexts([
      "고양이가 소파에서 잠을 잔다",
      "고양이가 의자 위에서 졸고 있다",
      "분기 매출이 전년 대비 크게 증가했다",
    ]);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
});

describe("W2 — chunks store 1536-dim embeddings (migration 0012)", () => {
  let admin: SupabaseClient;
  beforeAll(() => {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("accepts a shared_document + chunk with a 1536-dim embedding", async () => {
    const hash = `vitest-${Date.now()}`;

    const { data: sd, error: sdErr } = await admin
      .schema("dground")
      .from("shared_documents")
      .insert({
        content_hash: hash,
        original_filename: "vitest.pdf",
        mime_type: "application/pdf",
        byte_size: 1,
        storage_path: hash,
      })
      .select("id")
      .single();
    if (sdErr) throw new Error(`shared_documents insert failed — ${sdErr.message}`);

    const [vec] = await embedTexts(["청크 저장 테스트 문장"]);
    const { error: chErr } = await admin
      .schema("dground")
      .from("chunks")
      .insert({
        shared_doc_id: sd!.id,
        content: "청크 저장 테스트 문장",
        embedding: JSON.stringify(vec),
        chunk_index: 0,
        page: 1,
      });

    // Cascade-clean regardless of outcome.
    await admin
      .schema("dground")
      .from("shared_documents")
      .delete()
      .eq("id", sd!.id);

    if (chErr) {
      throw new Error(
        `chunk insert failed — run migration 0005_gemini_embeddings.sql? ` +
          `(${chErr.code}: ${chErr.message})`,
      );
    }
    expect(chErr).toBeNull();
  });
});
