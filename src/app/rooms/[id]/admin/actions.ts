"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
]);
const SENSITIVITIES = new Set(["public", "internal", "confidential"]);

/** Verify the caller owns the room. Throws otherwise. */
async function assertOwner(roomId: string) {
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
}

export async function updateRoomSettings(formData: FormData) {
  const roomId = String(formData.get("room_id") ?? "");
  await assertOwner(roomId);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/rooms/${roomId}/admin?error=name_required`);

  const modelRaw = String(formData.get("model") ?? "gemini-2.5-flash");
  const sensitivityRaw = String(formData.get("sensitivity") ?? "internal");
  const topK = Math.min(
    20,
    Math.max(1, Math.round(Number(formData.get("top_k")) || 6)),
  );
  const temperature = Math.min(
    1,
    Math.max(0, Number(formData.get("temperature")) || 0.2),
  );

  // Quotas — clamped to the PRD §3.8 system hard caps.
  const quotaDocs = Math.min(
    500,
    Math.max(1, Math.round(Number(formData.get("quota_docs")) || 100)),
  );
  const quotaMb = Math.min(
    2048,
    Math.max(10, Math.round(Number(formData.get("quota_mb")) || 500)),
  );
  const quotaDailyTokens = Math.min(
    5_000_000,
    Math.max(
      10_000,
      Math.round(Number(formData.get("quota_daily_tokens")) || 500_000),
    ),
  );

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .schema("dground")
    .from("rooms")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      system_prompt: String(formData.get("system_prompt") ?? "").trim(),
      model: MODELS.has(modelRaw) ? modelRaw : "gemini-2.5-flash",
      sensitivity: SENSITIVITIES.has(sensitivityRaw)
        ? sensitivityRaw
        : "internal",
      top_k: topK,
      temperature,
      quota_docs: quotaDocs,
      quota_bytes: quotaMb * 1024 * 1024,
      quota_daily_tokens: quotaDailyTokens,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomId);

  if (error) {
    redirect(`/rooms/${roomId}/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/rooms/${roomId}/admin`);
  revalidatePath(`/rooms/${roomId}`);
  redirect(`/rooms/${roomId}/admin?saved=1`);
}

export async function removeMember(formData: FormData) {
  const roomId = String(formData.get("room_id") ?? "");
  const memberId = String(formData.get("user_id") ?? "");
  await assertOwner(roomId);

  const admin = createSupabaseAdminClient();

  // The owner cannot be removed.
  const { data: room } = await admin
    .schema("dground")
    .from("rooms")
    .select("owner_id")
    .eq("id", roomId)
    .single();
  if (room?.owner_id === memberId) {
    throw new Error("cannot remove the room owner");
  }

  await admin
    .schema("dground")
    .from("memberships")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", memberId);

  revalidatePath(`/rooms/${roomId}/admin`);
}
