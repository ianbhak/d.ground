import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Daily purge cron (Vercel Cron → vercel.json).
 *
 * 1. Hard-deletes rooms whose 30-day grace period has elapsed —
 *    cascades memberships / threads / messages / room_documents /
 *    invites / usage_daily.
 * 2. Deletes SharedDocuments no room references any more, along with
 *    their chunks (cascade) and stored files.
 *
 * Authenticated via the CRON_SECRET env var — Vercel Cron sends it as
 * `Authorization: Bearer <CRON_SECRET>`.
 */

const GRACE_DAYS = 30;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const cutoff = new Date(
    Date.now() - GRACE_DAYS * 86_400_000,
  ).toISOString();

  // 1. Rooms past the grace window.
  const { data: expired } = await admin
    .schema("dground")
    .from("rooms")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  let purgedRooms = 0;
  for (const r of expired ?? []) {
    const { error } = await admin
      .schema("dground")
      .from("rooms")
      .delete()
      .eq("id", r.id);
    if (!error) purgedRooms += 1;
  }

  // 2. SharedDocuments no longer referenced by any room.
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

  let purgedDocs = 0;
  for (const o of orphans) {
    const { error } = await admin
      .schema("dground")
      .from("shared_documents")
      .delete()
      .eq("id", o.id);
    if (!error) {
      purgedDocs += 1;
      if (o.storage_path) {
        await admin.storage.from("dground-docs").remove([o.storage_path]);
      }
    }
  }

  return Response.json({ ok: true, purgedRooms, purgedDocs });
}
