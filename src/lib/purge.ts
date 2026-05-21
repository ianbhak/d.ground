import { createSupabaseAdminClient } from "./supabase/admin";

/**
 * Hard-delete the given rooms and clean up afterwards. Server-only.
 *
 * Deleting a room cascades its memberships / threads / messages /
 * room_documents / invites / usage_daily. SharedDocuments that no
 * room references any more are then removed, along with their chunks
 * (cascade) and stored files.
 *
 * Shared by the daily cron and the manual "permanent delete" action.
 */
export async function purgeRooms(
  roomIds: string[],
): Promise<{ rooms: number; docs: number }> {
  if (roomIds.length === 0) return { rooms: 0, docs: 0 };

  const admin = createSupabaseAdminClient();

  let rooms = 0;
  for (const id of roomIds) {
    const { error } = await admin
      .schema("dground")
      .from("rooms")
      .delete()
      .eq("id", id);
    if (!error) rooms += 1;
  }

  // SharedDocuments no longer referenced by any room.
  const { data: allDocs } = await admin
    .schema("dground")
    .from("shared_documents")
    .select("id, storage_path");
  const { data: refs } = await admin
    .schema("dground")
    .from("room_documents")
    .select("shared_doc_id");
  const referenced = new Set((refs ?? []).map((r) => r.shared_doc_id));
  const orphans = (allDocs ?? []).filter((d) => !referenced.has(d.id));

  let docs = 0;
  for (const o of orphans) {
    const { error } = await admin
      .schema("dground")
      .from("shared_documents")
      .delete()
      .eq("id", o.id);
    if (!error) {
      docs += 1;
      if (o.storage_path) {
        await admin.storage.from("dground-docs").remove([o.storage_path]);
      }
    }
  }

  return { rooms, docs };
}
