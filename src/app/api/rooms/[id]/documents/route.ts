import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractPdfPages } from "@/lib/pdf";
import { chunkDocument } from "@/lib/chunking";
import { embedTexts } from "@/lib/embedding";

const BUCKET = "dground-docs";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/**
 * Upload a PDF to a room and index it.
 *
 * Pipeline: auth (room admin) → SHA256 → SharedDocument dedup →
 * (new) Storage upload + text extract + chunk + embed + store chunks →
 * RoomDocument mapping.
 *
 * Heavy work (extract/embed) runs synchronously — fine for dev and
 * modest PDFs; W2.5 can move it to a background job.
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
    .select("id, owner_id")
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

  // ── Read file ────────────────────────────────────────────────────
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "no file" }, 400);
  if (file.type !== "application/pdf") {
    return json({ error: "PDF 파일만 업로드할 수 있습니다." }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "파일이 25MB를 초과합니다." }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");

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
    // New content (or a prior failed attempt) — (re)index it.
    const storagePath = `${hash}.pdf`;
    await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (existing) {
      sharedDocId = existing.id;
    } else {
      const { data: sd, error: sdErr } = await admin
        .schema("dground")
        .from("shared_documents")
        .insert({
          content_hash: hash,
          original_filename: file.name,
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
      const pages = await extractPdfPages(bytes);
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
      return json(
        { error: `색인 실패: ${(e as Error).message}` },
        500,
      );
    }
  }

  // ── Attach to the room (idempotent) ──────────────────────────────
  const { error: rdErr } = await admin
    .schema("dground")
    .from("room_documents")
    .insert({
      room_id: roomId,
      shared_doc_id: sharedDocId,
      display_filename: file.name,
      attached_by: user.id,
    });
  if (rdErr && !/duplicate|unique/i.test(rdErr.message)) {
    return json({ error: rdErr.message }, 500);
  }

  return json({ ok: true, dedup });
}
