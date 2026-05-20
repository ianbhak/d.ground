"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Regenerate a room's invite token. RLS (rooms_update) restricts this
 * to the room owner — a non-owner update simply affects zero rows.
 */
export async function regenerateJoinToken(roomId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const token = randomBytes(16).toString("hex");

  const { data, error } = await supabase
    .schema("dground")
    .from("rooms")
    .update({ join_token: token })
    .eq("id", roomId)
    .select("join_token")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "링크 재발급에 실패했습니다.");
  }

  revalidatePath(`/rooms/${roomId}`);
  return data.join_token;
}

/**
 * Detach a document from a room. Removes the room↔document mapping;
 * if no other room still references the underlying SharedDocument,
 * the document, its chunks, and the stored file are deleted too.
 */
export async function detachDocument(formData: FormData) {
  const roomId = String(formData.get("room_id") ?? "");
  const roomDocId = String(formData.get("room_document_id") ?? "");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("owner_id")
    .eq("id", roomId)
    .single();
  if (!room || room.owner_id !== user.id) {
    throw new Error("forbidden — room owner only");
  }

  const admin = createSupabaseAdminClient();

  const { data: rd } = await admin
    .schema("dground")
    .from("room_documents")
    .select("shared_doc_id")
    .eq("id", roomDocId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (!rd) {
    revalidatePath(`/rooms/${roomId}`);
    return;
  }

  await admin
    .schema("dground")
    .from("room_documents")
    .delete()
    .eq("id", roomDocId);

  // Last reference gone → drop the SharedDocument (cascades chunks)
  // and its stored file.
  const { count } = await admin
    .schema("dground")
    .from("room_documents")
    .select("id", { count: "exact", head: true })
    .eq("shared_doc_id", rd.shared_doc_id);

  if ((count ?? 0) === 0) {
    const { data: sd } = await admin
      .schema("dground")
      .from("shared_documents")
      .select("storage_path")
      .eq("id", rd.shared_doc_id)
      .maybeSingle();
    await admin
      .schema("dground")
      .from("shared_documents")
      .delete()
      .eq("id", rd.shared_doc_id);
    if (sd?.storage_path) {
      await admin.storage.from("dground-docs").remove([sd.storage_path]);
    }
  }

  revalidatePath(`/rooms/${roomId}`);
}
