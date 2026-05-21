import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { purgeRooms } from "@/lib/purge";

/**
 * Daily purge cron (Vercel Cron → vercel.json).
 *
 * Hard-deletes rooms whose 30-day grace period has elapsed, then
 * cleans up documents no room references any more. Authenticated via
 * the CRON_SECRET env var.
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

  const { data: expired } = await admin
    .schema("dground")
    .from("rooms")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  const { rooms, docs } = await purgeRooms(
    (expired ?? []).map((r) => r.id),
  );

  return Response.json({ ok: true, purgedRooms: rooms, purgedDocs: docs });
}
