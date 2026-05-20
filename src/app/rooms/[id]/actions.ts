"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
