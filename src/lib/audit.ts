import { createSupabaseAdminClient } from "./supabase/admin";

/**
 * Append an entry to dground.audit_log. Server-only.
 *
 * Best-effort: a logging failure is swallowed so it never breaks the
 * action being audited.
 */
export async function logAudit(entry: {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.schema("dground").from("audit_log").insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error("[audit] failed to log", entry.action, e);
  }
}
