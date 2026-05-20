import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedQuery } from "@/lib/embedding";
import { streamAnswer } from "@/lib/generation";
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
 * Retrieval (embed → match_chunks) runs first and non-streamed; the
 * answer is then streamed back as newline-delimited JSON events:
 *   {"type":"sources","sources":[...]}
 *   {"type":"delta","text":"..."}   (repeated)
 *   {"type":"done"}  |  {"type":"error","error":"..."}
 * The assistant message is persisted once the stream completes.
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
    mode?: "private" | "shared";
  } | null;
  const message = body?.message?.trim();
  if (!message) return json({ error: "메시지가 비어 있습니다." }, 400);
  const mode = body?.mode === "shared" ? "shared" : "private";

  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("id, model, system_prompt, quota_daily_tokens")
    .eq("id", roomId)
    .is("deleted_at", null)
    .single();
  if (!room) return json({ error: "room not found or no access" }, 404);

  // ── Daily token quota (rolling 24h, room-wide) ───────────────────
  {
    const admin = createSupabaseAdminClient();
    const { data: roomThreads } = await admin
      .schema("dground")
      .from("threads")
      .select("id")
      .eq("room_id", roomId);
    const threadIds = (roomThreads ?? []).map((t) => t.id);
    if (threadIds.length > 0) {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { data: recent } = await admin
        .schema("dground")
        .from("messages")
        .select("tokens_in, tokens_out")
        .in("thread_id", threadIds)
        .gte("created_at", since);
      const used = (recent ?? []).reduce(
        (s, m) => s + (m.tokens_in ?? 0) + (m.tokens_out ?? 0),
        0,
      );
      if (used >= room.quota_daily_tokens) {
        return json(
          {
            error: `이 방의 24시간 토큰 한도(${room.quota_daily_tokens.toLocaleString()})에 도달했습니다. 잠시 후 다시 시도해 주세요.`,
          },
          429,
        );
      }
    }
  }

  // ── Resolve the thread ───────────────────────────────────────────
  // shared: the room's single shared thread (always exists).
  // private: the caller's private thread, created on first use.
  let threadId: string;
  if (mode === "shared") {
    const { data: shared } = await supabase
      .schema("dground")
      .from("threads")
      .select("id")
      .eq("room_id", roomId)
      .eq("visibility", "shared")
      .maybeSingle();
    if (!shared) {
      return json({ error: "공용 스레드를 찾을 수 없습니다." }, 500);
    }
    threadId = shared.id;
  } else {
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
  }

  const meta = user.user_metadata ?? {};
  const senderName =
    (meta.full_name as string) ||
    (meta.name as string) ||
    user.email ||
    "멤버";

  const { data: userMsg } = await supabase
    .schema("dground")
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      role: "user",
      content: message,
      sender_name: senderName,
    })
    .select("id")
    .single();

  // ── Retrieve (non-streamed) ──────────────────────────────────────
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

  const sources = chunks.map((c) => ({
    chunk_id: c.chunk_id,
    filename: c.filename,
    page: c.page,
    similarity: c.similarity,
  }));

  // ── Stream the answer ────────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      send({ type: "user_id", id: userMsg?.id ?? null });
      send({ type: "sources", sources });

      let answer = "";
      let tokensIn = 0;
      let tokensOut = 0;

      try {
        for await (const event of streamAnswer({
          model: room.model,
          systemPrompt: buildSystemPrompt(room.system_prompt ?? ""),
          userPrompt: buildUserPrompt(chunks, message),
        })) {
          if ("delta" in event) {
            answer += event.delta;
            send({ type: "delta", text: event.delta });
          } else {
            tokensIn = event.tokensIn;
            tokensOut = event.tokensOut;
          }
        }
      } catch (e) {
        const msg = (e as Error).message;
        const friendly = /\b(503|429)\b|UNAVAILABLE|overload|high demand/i.test(
          msg,
        )
          ? "AI 모델이 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요."
          : `생성 실패: ${msg}`;
        send({ type: "error", error: friendly });
        controller.close();
        return;
      }

      // Persist the assistant message once the stream is complete.
      const { data: asstMsg } = await supabase
        .schema("dground")
        .from("messages")
        .insert({
          thread_id: threadId,
          sender_id: null,
          role: "assistant",
          content: answer || "응답을 생성하지 못했습니다.",
          sources,
          model: room.model,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
        })
        .select("id")
        .single();
      await supabase
        .schema("dground")
        .from("threads")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", threadId);

      send({ type: "done", id: asstMsg?.id ?? null });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
