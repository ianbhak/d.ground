import Link from "next/link";
import { redirect } from "next/navigation";
import Brandmark from "@/components/Brandmark";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/super-admin";
import { estimateCostUsd, formatUsd, formatKrw } from "@/lib/pricing";
import { forceDeleteRoom } from "./actions";

function fmtDate(s: string): string {
  return new Date(s).toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function SuperAdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isSuperAdmin(user.email)) redirect("/");

  const admin = createSupabaseAdminClient();

  const [
    { data: rooms },
    { data: memberships },
    { data: roomDocs },
    { data: threads },
    { data: userList },
    { data: auditLog },
  ] = await Promise.all([
    admin
      .schema("dground")
      .from("rooms")
      .select("id, slug, name, owner_id, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin.schema("dground").from("memberships").select("room_id, user_id"),
    admin.schema("dground").from("room_documents").select("room_id"),
    admin.schema("dground").from("threads").select("id"),
    admin.auth.admin.listUsers(),
    admin
      .schema("dground")
      .from("audit_log")
      .select("actor_id, action, target_type, target_id, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // user id → email
  const emailById = new Map<string, string>();
  for (const u of userList?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  // per-room counts
  const memberCount = new Map<string, number>();
  for (const m of memberships ?? []) {
    memberCount.set(m.room_id, (memberCount.get(m.room_id) ?? 0) + 1);
  }
  const docCount = new Map<string, number>();
  for (const d of roomDocs ?? []) {
    docCount.set(d.room_id, (docCount.get(d.room_id) ?? 0) + 1);
  }

  // global usage / cost
  const threadIds = (threads ?? []).map((t) => t.id);
  let totalMessages = 0;
  let totalCost = 0;
  if (threadIds.length > 0) {
    const { data: msgs } = await admin
      .schema("dground")
      .from("messages")
      .select("model, tokens_in, tokens_out, role")
      .eq("role", "assistant");
    for (const m of msgs ?? []) {
      totalMessages += 1;
      totalCost += estimateCostUsd(
        m.model ?? "gemini-2.5-flash",
        m.tokens_in ?? 0,
        m.tokens_out ?? 0,
      );
    }
  }

  const stats = [
    { label: "방", value: rooms?.length ?? 0 },
    { label: "유저", value: userList?.users?.length ?? 0 },
    { label: "메시지", value: totalMessages },
  ];

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 sm:px-10">
        <Brandmark />
        <Link
          href="/"
          className="oma-label text-black/40 transition-colors hover:text-black"
        >
          ← 홈
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14 oma-fade sm:px-10">
        <p className="oma-label text-[var(--color-accent)]">Super Admin</p>
        <h1 className="mt-3 font-serif text-3xl tracking-tight">운영 콘솔</h1>
        <p className="mt-2 text-sm text-black/55">{user.email}</p>

        {/* ── 전역 통계 ──────────────────────────────────────── */}
        <div className="mt-8 grid gap-px border border-black bg-black sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white p-5">
              <p className="oma-label text-black/40">{s.label}</p>
              <p className="mt-2 font-serif text-3xl">{s.value}</p>
            </div>
          ))}
          <div className="bg-white p-5">
            <p className="oma-label text-black/40">추정 비용</p>
            <p className="mt-2 font-serif text-3xl">{formatUsd(totalCost)}</p>
            <p className="mt-1 text-xs text-black/40">
              ≈ {formatKrw(totalCost)}
            </p>
          </div>
        </div>

        {/* ── 방 목록 ────────────────────────────────────────── */}
        <section className="mt-10">
          <p className="oma-label text-black/40">Rooms</p>
          <h2 className="mt-1 font-serif text-2xl">전체 방</h2>

          {rooms && rooms.length > 0 ? (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/15 text-left">
                  <th className="oma-label py-2 text-black/40">이름</th>
                  <th className="oma-label py-2 text-black/40">소유자</th>
                  <th className="oma-label py-2 text-right text-black/40">
                    멤버/문서
                  </th>
                  <th className="oma-label py-2 text-right text-black/40">
                    삭제
                  </th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-b border-black/10">
                    <td className="py-2">
                      <Link
                        href={`/rooms/${r.slug ?? r.id}` as never}
                        className="hover:text-[var(--color-accent)]"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="py-2 font-mono text-xs text-black/55">
                      {emailById.get(r.owner_id) ?? "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-xs text-black/55">
                      {memberCount.get(r.id) ?? 0} / {docCount.get(r.id) ?? 0}
                    </td>
                    <td className="py-2 text-right">
                      <form action={forceDeleteRoom}>
                        <input type="hidden" name="room_id" value={r.id} />
                        <button
                          type="submit"
                          className="oma-label text-black/30 transition-colors hover:text-[var(--color-accent)]"
                        >
                          삭제
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-black/45">방이 없습니다.</p>
          )}
        </section>

        {/* ── 유저 ───────────────────────────────────────────── */}
        <section className="mt-10">
          <p className="oma-label text-black/40">Users</p>
          <h2 className="mt-1 font-serif text-2xl">
            전체 유저{" "}
            <span className="text-black/30">
              {userList?.users?.length ?? 0}
            </span>
          </h2>
          <ul className="mt-4 divide-y border-y border-black/10">
            {(userList?.users ?? []).slice(0, 30).map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span>{u.email}</span>
                <span className="font-mono text-xs text-black/35">
                  {fmtDate(u.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 감사 로그 ──────────────────────────────────────── */}
        <section className="mt-10">
          <p className="oma-label text-black/40">Audit log</p>
          <h2 className="mt-1 font-serif text-2xl">감사 로그</h2>

          {auditLog && auditLog.length > 0 ? (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/15 text-left">
                  <th className="oma-label py-2 text-black/40">시각</th>
                  <th className="oma-label py-2 text-black/40">행위자</th>
                  <th className="oma-label py-2 text-black/40">액션</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((a, i) => (
                  <tr key={i} className="border-b border-black/10">
                    <td className="py-2 font-mono text-xs text-black/45">
                      {fmtDate(a.created_at)}
                    </td>
                    <td className="py-2 font-mono text-xs text-black/55">
                      {(a.actor_id && emailById.get(a.actor_id)) ?? "—"}
                    </td>
                    <td className="py-2 font-mono text-xs">{a.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-black/45">
              기록된 감사 로그가 없습니다.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
