import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "dground-docs";
const MAX_BYTES = 32 * 1024 * 1024; // 32 MB per file

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/**
 * Issue a signed URL so the browser can upload a PDF straight to
 * Supabase Storage, bypassing Vercel's request-body limit.
 *
 * Body: { hash, filename, size } — hash is the SHA-256 the client
 * computed over the file. If that content is already indexed the
 * response is { dedup: true } and no upload is needed; otherwise it
 * returns { path, token } for storage.uploadToSignedUrl().
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

  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("id, owner_id, quota_docs, quota_bytes")
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

  const body = (await req.json().catch(() => null)) as {
    hash?: string;
    filename?: string;
    size?: number;
  } | null;
  const hash = body?.hash ?? "";
  const filename = (body?.filename ?? "").trim();
  const size = Number(body?.size ?? 0);

  if (!/^[a-f0-9]{64}$/.test(hash) || !filename) {
    return json({ error: "bad request" }, 400);
  }
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return json({ error: "PDF 파일만 업로드할 수 있습니다." }, 400);
  }
  if (size > MAX_BYTES) {
    return json(
      { error: `파일이 ${MAX_BYTES / 1024 / 1024}MB를 초과합니다.` },
      400,
    );
  }

  const admin = createSupabaseAdminClient();

  // ── Quota: document count ────────────────────────────────────────
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

  // ── Quota: total size ────────────────────────────────────────────
  const { data: roomDocs } = await admin
    .schema("dground")
    .from("room_documents")
    .select("shared_documents(byte_size)")
    .eq("room_id", roomId);
  const usedBytes = (roomDocs ?? []).reduce((sum, rd) => {
    const sd = Array.isArray(rd.shared_documents)
      ? rd.shared_documents[0]
      : rd.shared_documents;
    return sum + ((sd?.byte_size as number) ?? 0);
  }, 0);
  if (usedBytes + size > room.quota_bytes) {
    const limitMb = Math.round(room.quota_bytes / 1024 / 1024);
    return json({ error: `용량 한도(${limitMb}MB)를 초과합니다.` }, 400);
  }

  // ── Dedup: already-indexed content needs no upload ───────────────
  const { data: existing } = await admin
    .schema("dground")
    .from("shared_documents")
    .select("status")
    .eq("content_hash", hash)
    .maybeSingle();
  if (existing?.status === "indexed") {
    return json({ dedup: true });
  }

  // ── Signed upload URL — keyed by content hash ────────────────────
  const { data: signed, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(`${hash}.pdf`, { upsert: true });
  if (error || !signed) {
    return json({ error: error?.message ?? "signed url failed" }, 500);
  }

  return json({ path: signed.path, token: signed.token });
}
