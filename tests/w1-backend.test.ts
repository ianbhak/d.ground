import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * W1 backend integration tests.
 *
 * Verifies the Supabase side of W1 is correctly set up:
 *   - env vars present
 *   - dground schema exposed to the Data API (PostgREST)
 *   - all 10 dground tables reachable (schema + grants applied)
 *   - a room can be written against the shared auth.users table
 *   - RLS blocks anonymous reads
 *
 * Run: npm test
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const DGROUND_TABLES = [
  "rooms",
  "memberships",
  "shared_documents",
  "room_documents",
  "chunks",
  "threads",
  "messages",
  "invites",
  "usage_daily",
  "audit_log",
] as const;

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe("W1 — environment", () => {
  it("Supabase URL and keys are configured", () => {
    expect(SUPABASE_URL).toMatch(/^https:\/\/.+\.supabase\.co$/);
    expect(ANON_KEY.length).toBeGreaterThan(20);
    expect(SERVICE_KEY.length).toBeGreaterThan(20);
  });
});

describe("W1 — dground schema reachable via Data API", () => {
  let admin: SupabaseClient;
  beforeAll(() => {
    admin = serviceClient();
  });

  it("dground schema is exposed to PostgREST", async () => {
    const { error } = await admin
      .schema("dground")
      .from("rooms")
      .select("id")
      .limit(1);

    if (error?.code === "PGRST106") {
      throw new Error(
        "dground schema is NOT exposed to the Data API.\n" +
          "Fix: Supabase Dashboard → Project Settings → API → " +
          "Exposed schemas → add `dground` → Save.",
      );
    }
    expect(error?.code).not.toBe("PGRST106");
  });

  it.each(DGROUND_TABLES)(
    "table dground.%s exists and is reachable",
    async (table) => {
      const { error } = await admin
        .schema("dground")
        .from(table)
        .select("*")
        .limit(1);

      if (error) {
        throw new Error(
          `dground.${table} not reachable — ${error.code}: ${error.message}\n` +
            "If code is 42501 (permission denied), run migration " +
            "0002_dground_grants.sql.",
        );
      }
      expect(error).toBeNull();
    },
  );
});

describe("W1 — room write path (shared auth.users FK)", () => {
  let admin: SupabaseClient;
  beforeAll(() => {
    admin = serviceClient();
  });

  it("creates a room owned by a real auth user, then cleans up", async () => {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    expect(listErr).toBeNull();

    const owner = list?.users?.[0];
    if (!owner) {
      console.warn(
        "[skip] No auth.users yet — sign in via Google once, then re-run.",
      );
      return;
    }

    const { data: room, error: insErr } = await admin
      .schema("dground")
      .from("rooms")
      .insert({ name: "[vitest] temp room", owner_id: owner.id })
      .select("id")
      .single();

    if (insErr) {
      throw new Error(`room insert failed — ${insErr.code}: ${insErr.message}`);
    }
    expect(room?.id).toBeTruthy();

    if (room?.id) {
      const { error: delErr } = await admin
        .schema("dground")
        .from("rooms")
        .delete()
        .eq("id", room.id);
      expect(delErr).toBeNull();
    }
  });
});

describe("W1 — invite-link model (migration 0004)", () => {
  let admin: SupabaseClient;
  beforeAll(() => {
    admin = serviceClient();
  });

  it("rooms.join_token column exists", async () => {
    const { error } = await admin
      .schema("dground")
      .from("rooms")
      .select("join_token")
      .limit(1);

    if (error) {
      throw new Error(
        `join_token not found — run migration 0004_invite_link_model.sql. ` +
          `(${error.code}: ${error.message})`,
      );
    }
    expect(error).toBeNull();
  });

  it("join_room_by_token RPC is registered", async () => {
    // Calling with a bogus token returns null (not a "function missing" error).
    const { error } = await admin
      .schema("dground")
      .rpc("join_room_by_token", { p_token: "does-not-exist" });

    if (error?.code === "PGRST202") {
      throw new Error(
        "join_room_by_token RPC missing — run migration 0004.",
      );
    }
    expect(error?.code).not.toBe("PGRST202");
  });
});

describe("W1 — RLS blocks anonymous access", () => {
  it("anon client reads zero rooms", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await anon.schema("dground").from("rooms").select("id");
    expect(data ?? []).toEqual([]);
  });
});
