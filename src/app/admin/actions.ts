"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/super-admin";
import { logAudit } from "@/lib/audit";

/** Verify the caller is a super admin. Returns their user id. */
async function assertSuperAdmin(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isSuperAdmin(user.email)) {
    throw new Error("forbidden — super admin only");
  }
  return user.id;
}

/** Soft-delete a room (30-day grace period per PRD §3.7). */
export async function forceDeleteRoom(formData: FormData) {
  const roomId = String(formData.get("room_id") ?? "");
  const actorId = await assertSuperAdmin();

  const admin = createSupabaseAdminClient();
  await admin
    .schema("dground")
    .from("rooms")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", roomId);

  await logAudit({
    actorId,
    action: "room.delete",
    targetType: "room",
    targetId: roomId,
    metadata: { by: "super_admin" },
  });

  revalidatePath("/admin");
}
