"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { purgeRooms } from "@/lib/purge";

/**
 * Restore a soft-deleted room within its 30-day grace period.
 * RLS (rooms_update) restricts this to the room owner.
 */
export async function restoreRoom(formData: FormData) {
  const roomId = String(formData.get("room_id") ?? "");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .schema("dground")
    .from("rooms")
    .update({ deleted_at: null })
    .eq("id", roomId)
    .eq("owner_id", user.id);

  if (!error) {
    await logAudit({
      actorId: user.id,
      action: "room.restore",
      targetType: "room",
      targetId: roomId,
    });
  }

  revalidatePath("/");
}

/**
 * Permanently delete soft-deleted rooms now, skipping the 30-day
 * grace period. Only the caller's own already-deleted rooms are
 * purged — any other id in the form is ignored.
 */
export async function purgeRoomsNow(formData: FormData) {
  const requested = formData.getAll("room_id").map(String).filter(Boolean);
  if (requested.length === 0) {
    revalidatePath("/");
    return;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only the user's own, already soft-deleted rooms are eligible.
  const { data: eligible } = await supabase
    .schema("dground")
    .from("rooms")
    .select("id")
    .eq("owner_id", user.id)
    .not("deleted_at", "is", null)
    .in("id", requested);

  const ids = (eligible ?? []).map((r) => r.id);
  if (ids.length > 0) {
    await purgeRooms(ids);
    for (const id of ids) {
      await logAudit({
        actorId: user.id,
        action: "room.purge",
        targetType: "room",
        targetId: id,
      });
    }
  }

  revalidatePath("/");
}
