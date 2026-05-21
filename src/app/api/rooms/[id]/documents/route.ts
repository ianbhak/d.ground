import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractPdfContent } from "@/lib/pdf";
import { chunkDocument } from "@/lib/chunking";
import { embedTexts } from "@/lib/embedding";
import { logAudit } from "@/lib/audit";

const BUCKET = "dground-docs";

// Indexing a large PDF (extract + embed) runs synchronously here, so
// the function needs a generous ceiling. Phase 2 moves this to a
// background job; until then, very large scans may still time out.
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/**
 * Register and index a PDF that the browser already uploaded straight
 * to Storage via a signed URL (see ./upload-url).
 *
 * Body: { hash, filename }. Pipeline: auth (room admin) →
 * SharedDocument dedup → download from Storage → extract + chunk +
 * embed + store chunks → RoomDocument mapping.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roomId } = await params;

  // ── Auth: must be the room owner or an admin member ──────────────
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("id, owner_id, quota_docs")
    .eq("id", roomId)
    .is("deleted_at", null)
    .single();
  if (!room) return json({ error: "room not found" }, 404);

  let isAdmin = room.owner_id === user.id;
  if (!isAdmin) {
    const { data: m } = await supabase
      .schema("dground")
      .from("memberships")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();
    isAdmin = m?.role === "admin";
  }
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  // ── Input ────────────────────────────────────────────────────────
  const body = (await req.json().catch(() => null)) as {
    hash?: string;
    filename?: string;
  } | null;
  const hash = body?.hash ?? "";
  const filename = (body?.filename ?? "").trim();
  if (!/^[a-f0-9]{64}$/.test(hash) || !filename) {
    return json({ error: "bad request" }, 400);
  }

  const admin = createSupabaseAdminClient();

  // ── Dedup: has this exact content been indexed before? ───────────
  const { data: existing } = await admin
    .schema("dground")
    .from("shared_documents")
    .select("id, status")
    .eq("content_hash", hash)
    .maybeSingle();

  let sharedDocId: string;
  let dedup = false;

  if (existing && existing.status === "indexed") {
    sharedDocId = existing.id;
    dedup = true;
  } else {
    // Document count quota — checked again here in case the client
    // skipped the upload-url step.
    const { count: docCount } = await admin
      .schema("dground")
      .from("room_documents")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId);
    if ((docCount ?? 0) >= room.quota_docs) {
      return json(
        { error: `문서 수 한도(${room.quota_docs}개)에 도달했습니다.` },
        400,
      );
    }

    // Pull the browser-uploaded PDF back out of Storage.
    const storagePath = `${hash}.pdf`;
    const { data: blob, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(storagePath);
    if (dlErr || !blob) {
      return json(
        { error: "업로드된 파일을 찾을 수 없습니다. 다시 시도해 주세요." },
        400,
      );
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    if (existing) {
      sharedDocId = existing.id;
    } else {
      const { data: sd, error: sdErr } = await admin
        .schema("dground")
        .from("shared_documents")
        .insert({
          content_hash: hash,
          original_filename: filename,
          mime_type: "application/pdf",
          byte_size: bytes.byteLength,
          storage_path: storagePath,
          status: "pending",
        })
        .select("id")
        .single();
      if (sdErr || !sd) {
        return json({ error: sdErr?.message ?? "insert failed" }, 500);
      }
      sharedDocId = sd.id;
    }

    try {
      const pages = await extractPdfContent(bytes);
      const chunks = chunkDocument(pages);
      if (chunks.length === 0) {
        throw new Error("추출 가능한 텍스트가 없습니다 (스캔 PDF일 수 있음).");
      }

      const vectors = await embedTexts(
        chunks.map((c) => c.content),
        "RETRIEVAL_DOCUMENT",
      );

      const rows = chunks.map((c, i) => ({
        shared_doc_id: sharedDocId,
        content: c.content,
        embedding: JSON.stringify(vectors[i]),
        page: c.page,
        chunk_index: c.index,
      }));

      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await admin
          .schema("dground")
          .from("chunks")
          .insert(rows.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }

      await admin
        .schema("dground")
        .from("shared_documents")
        .update({ status: "indexed", indexed_at: new Date().toISOString() })
        .eq("id", sharedDocId);
    } catch (e) {
      await admin
        .schema("dground")
        .from("shared_documents")
        .update({ status: "failed" })
        .eq("id", sharedDocId);
      return json({ error: `색인 실패: ${(e as Error).message}` }, 500);
    }
  }

  // ── Attach to the room (idempotent) ──────────────────────────────
  const { error: rdErr } = await admin
    .schema("dground")
    .from("room_documents")
    .insert({
      room_id: roomId,
      shared_doc_id: sharedDocId,
      display_filename: filename,
      attached_by: user.id,
    });
  if (rdErr && !/duplicate|unique/i.test(rdErr.message)) {
    return json({ error: rdErr.message }, 500);
  }

  await logAudit({
    actorId: user.id,
    action: "document.upload",
    targetType: "room",
    targetId: roomId,
    metadata: { filename, dedup },
  });

  return json({ ok: true, dedup });
}
