import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "../src/lib/embedding";
import { generateAnswer } from "../src/lib/generation";
import { buildSystemPrompt, buildUserPrompt } from "../src/lib/rag";

/**
 * W3 RAG chat integration tests — hits the real Gemini API and the
 * match_chunks RPC. Surfaces failures in generation, retrieval, or
 * the end-to-end RAG flow.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

describe("W3 — Gemini generation", () => {
  it("generates a non-empty answer with token counts", async () => {
    const r = await generateAnswer({
      model: "gemini-2.5-flash",
      systemPrompt: "한국어로 한 문장으로 간결하게 답하세요.",
      userPrompt: "대한민국의 수도는?",
    });
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.tokensIn).toBeGreaterThan(0);
    expect(r.tokensOut).toBeGreaterThan(0);
  });
});

describe("W3 — match_chunks retrieval", () => {
  let admin: SupabaseClient;
  beforeAll(() => {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("returns chunks for a room that has indexed documents", async () => {
    const { data: rd } = await admin
      .schema("dground")
      .from("room_documents")
      .select("room_id")
      .limit(1)
      .maybeSingle();

    if (!rd) {
      console.warn("[skip] no room_documents — upload a PDF first");
      return;
    }

    const qv = await embedQuery("사업 개요");
    const { data, error } = await admin
      .schema("dground")
      .rpc("match_chunks", {
        query_embedding: JSON.stringify(qv),
        p_room_id: rd.room_id,
        match_count: 5,
      });

    if (error) {
      throw new Error(
        `match_chunks failed — ${error.code}: ${error.message}`,
      );
    }
    expect(Array.isArray(data)).toBe(true);
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data![0]).toHaveProperty("content");
    expect(data![0]).toHaveProperty("similarity");
  });
});

describe("W3 — full RAG roundtrip", () => {
  let admin: SupabaseClient;
  beforeAll(() => {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("retrieves context and generates a grounded answer", async () => {
    const { data: rd } = await admin
      .schema("dground")
      .from("room_documents")
      .select("room_id")
      .limit(1)
      .maybeSingle();
    if (!rd) {
      console.warn("[skip] no room_documents — upload a PDF first");
      return;
    }

    const question = "이 문서의 핵심 내용을 한 문장으로 요약하면?";
    const qv = await embedQuery(question);
    const { data: chunks } = await admin
      .schema("dground")
      .rpc("match_chunks", {
        query_embedding: JSON.stringify(qv),
        p_room_id: rd.room_id,
        match_count: 6,
      });

    const answer = await generateAnswer({
      model: "gemini-2.5-flash",
      systemPrompt: buildSystemPrompt(""),
      userPrompt: buildUserPrompt(chunks ?? [], question),
    });

    expect(answer.text.length).toBeGreaterThan(0);
  });
});
