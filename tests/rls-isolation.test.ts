import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * RLS regression tests — run as a real `authenticated` user (not
 * service_role), so RLS policies are actually exercised.
 *
 * Catches the class of bug where service-role tests pass but the
 * authenticated read path is broken (e.g. migration 0010).
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

describe("RLS — room member can read shared_documents", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  const email = `vitest-rls-${Date.now()}@example.com`;
  const password = `vitest-${randomUUID()}`;
  let userId = "";
  let roomId = "";
  let sharedDocId = "";

  beforeAll(async () => {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: created } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    userId = created?.user?.id ?? "";

    const { data: room } = await admin
      .schema("dground")
      .from("rooms")
      .insert({ name: "[vitest] rls room", owner_id: userId })
      .select("id")
      .single();
    roomId = room?.id ?? "";

    await admin.schema("dground").from("memberships").insert({
      room_id: roomId,
      user_id: userId,
      role: "admin",
      joined_via: "owner",
    });

    const hash = `vitest-rls-${Date.now()}`;
    const { data: sd } = await admin
      .schema("dground")
      .from("shared_documents")
      .insert({
        content_hash: hash,
        original_filename: "rls.pdf",
        mime_type: "application/pdf",
        byte_size: 123,
        storage_path: hash,
        status: "indexed",
      })
      .select("id")
      .single();
    sharedDocId = sd?.id ?? "";

    await admin.schema("dground").from("room_documents").insert({
      room_id: roomId,
      shared_doc_id: sharedDocId,
      display_filename: "rls.pdf",
      attached_by: userId,
    });

    userClient = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (roomId) {
      await admin.schema("dground").from("rooms").delete().eq("id", roomId);
    }
    if (sharedDocId) {
      await admin
        .schema("dground")
        .from("shared_documents")
        .delete()
        .eq("id", sharedDocId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("embeds shared_documents in the room document list", async () => {
    const { data, error } = await userClient
      .schema("dground")
      .from("room_documents")
      .select("display_filename, shared_documents(status, byte_size)")
      .eq("room_id", roomId);

    expect(error).toBeNull();
    expect(data?.length).toBe(1);

    const row = data![0];
    const sd = Array.isArray(row.shared_documents)
      ? row.shared_documents[0]
      : row.shared_documents;

    // Before migration 0010 this is null — the RLS policy hid it.
    expect(sd, "shared_documents embed is null — run migration 0010").not.toBe(
      null,
    );
    expect(sd?.status).toBe("indexed");
    expect(sd?.byte_size).toBe(123);
  });
});
