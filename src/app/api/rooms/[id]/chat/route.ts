import { createSupabaseServerClient } from "@/lib/supabase/server";
import { embedQuery } from "@/lib/embedding";
import { generateAnswer } from "@/lib/generation";
import {
  buildSystemPrompt,
  buildUserPrompt,
  type RetrievedChunk,
} from "@/lib/rag";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

const TOP_K = 6;

/**
 * RAG chat — answers a question grounded in the room's documents.
 *
 * embed question → match_chunks (vector search, room-isolated) →
 * Gemini answer → persist user + assistant messages with sources.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roomId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => null)) as {
    message?: string;
  } | null;
  const message = body?.message?.trim();
  if (!message) return json({ error: "메시지가 비어 있습니다." }, 400);

  // Room — RLS already restricts to rooms the user belongs to.
  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("id, model, system_prompt")
    .eq("id", roomId)
    .is("deleted_at", null)
    .single();
  if (!room) return json({ error: "room not found or no access" }, 404);

  // ── Get-or-create the user's private thread for this room ────────
  let threadId: string;
  const { data: existing } = await supabase
    .schema("dground")
    .from("threads")
    .select("id")
    .eq("room_id", roomId)
    .eq("visibility", "private")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    threadId = existing.id;
  } else {
    const { data: created, error: tErr } = await supabase
      .schema("dground")
      .from("threads")
      .insert({ room_id: roomId, visibility: "private", user_id: user.id })
      .select("id")
      .single();
    if (tErr || !created) {
      return json({ error: tErr?.message ?? "thread create failed" }, 500);
    }
    threadId = created.id;
  }

  // ── Persist the user message ─────────────────────────────────────
  await supabase.schema("dground").from("messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    role: "user",
    content: message,
  });

  // ── Retrieve ─────────────────────────────────────────────────────
  let chunks: RetrievedChunk[] = [];
  try {
    const queryVec = await embedQuery(message);
    const { data: matches, error: matchErr } = await supabase
      .schema("dground")
      .rpc("match_chunks", {
        query_embedding: JSON.stringify(queryVec),
        p_room_id: roomId,
        match_count: TOP_K,
      });
    if (matchErr) throw new Error(matchErr.message);
    chunks = (matches ?? []) as RetrievedChunk[];
  } catch (e) {
    return json({ error: `검색 실패: ${(e as Error).message}` }, 500);
  }

  // ── Generate ─────────────────────────────────────────────────────
  let answer: string;
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const result = await generateAnswer({
      model: room.model,
      systemPrompt: buildSystemPrompt(room.system_prompt ?? ""),
      userPrompt: buildUserPrompt(chunks, message),
    });
    answer = result.text || "응답을 생성하지 못했습니다.";
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;
  } catch (e) {
    return json({ error: `생성 실패: ${(e as Error).message}` }, 500);
  }

  const sources = chunks.map((c) => ({
    chunk_id: c.chunk_id,
    filename: c.filename,
    page: c.page,
    similarity: c.similarity,
  }));

  // ── Persist the assistant message ────────────────────────────────
  await supabase
    .schema("dground")
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_id: null,
      role: "assistant",
      content: answer,
      sources,
      model: room.model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });

  await supabase
    .schema("dground")
    .from("threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);

  return json({ answer, sources, threadId });
}
