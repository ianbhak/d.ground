"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

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
