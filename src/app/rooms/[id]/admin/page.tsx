import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Brandmark from "@/components/Brandmark";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/slug";
import {
  estimateCostUsd,
  formatUsd,
  formatKrw,
  MODEL_RATES,
} from "@/lib/pricing";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { updateRoomSettings, removeMember, softDeleteRoom } from "./actions";

const inputClass =
  "w-full border border-black bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]";

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("ko-KR");
}

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("*")
    .eq(isUuid(id) ? "id" : "slug", id)
    .is("deleted_at", null)
    .single();
  if (!room) notFound();
  if (room.owner_id !== user.id) redirect(`/rooms/${id}`);

  // Admin-only data — service role (RLS bypassed after the owner check).
  const admin = createSupabaseAdminClient();

  const { data: members } = await admin
    .schema("dground")
    .from("memberships")
    .select("user_id, role, joined_at, joined_via")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true });

  const { data: threads } = await admin
    .schema("dground")
    .from("threads")
    .select("id")
    .eq("room_id", room.id);
  const threadIds = (threads ?? []).map((t) => t.id);

  let msgRows: {
    model: string | null;
    tokens_in: number;
    tokens_out: number;
    sender_id: string | null;
    sender_name: string | null;
    role: string;
  }[] = [];
  if (threadIds.length > 0) {
    const { data } = await admin
      .schema("dground")
      .from("messages")
      .select("model, tokens_in, tokens_out, sender_id, sender_name, role")
      .in("thread_id", threadIds);
    msgRows = data ?? [];
  }

  // Member display names — best effort from message sender names.
  const nameMap = new Map<string, string>();
  for (const m of msgRows) {
    if (m.sender_id && m.sender_name) nameMap.set(m.sender_id, m.sender_name);
  }

  // Usage aggregation by model (assistant messages carry token counts).
  const perModel = new Map<
    string,
    { count: number; tokensIn: number; tokensOut: number }
  >();
  for (const m of msgRows) {
    if (m.role !== "assistant") continue;
    const model = m.model ?? "gemini-2.5-flash";
    const agg = perModel.get(model) ?? { count: 0, tokensIn: 0, tokensOut: 0 };
    agg.count += 1;
    agg.tokensIn += m.tokens_in ?? 0;
    agg.tokensOut += m.tokens_out ?? 0;
    perModel.set(model, agg);
  }
  const usageRows = [...perModel.entries()].map(([model, a]) => ({
    model,
    ...a,
    cost: estimateCostUsd(model, a.tokensIn, a.tokensOut),
  }));
  const totalCost = usageRows.reduce((s, r) => s + r.cost, 0);
  const totalMessages = usageRows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 sm:px-10">
        <Brandmark />
        <Link
          href={`/rooms/${id}` as never}
          className="oma-label text-black/40 transition-colors hover:text-black"
        >
          ← 방으로
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-14 oma-fade">
        <p className="oma-label text-[var(--color-accent)]">Room Admin</p>
        <h1 className="mt-3 font-serif text-3xl tracking-tight">방 관리</h1>
        <p className="mt-2 text-sm text-black/55">{room.name}</p>

        {saved && (
          <div className="mt-6 border-l-4 border-l-black bg-white px-4 py-3 text-sm oma-shadow-sm">
            설정이 저장되었습니다.
          </div>
        )}
        {error && (
          <div className="mt-6 border-l-4 border-l-[var(--color-accent)] bg-white px-4 py-3 text-sm oma-shadow-sm">
            {error === "name_required" ? "방 이름을 입력해 주세요." : error}
          </div>
        )}

        {/* ── 사용량 ─────────────────────────────────────────── */}
        <section className="mt-10">
          <p className="oma-label text-black/40">Usage</p>
          <h2 className="mt-1 font-serif text-2xl">사용량 · 비용</h2>

          <div className="mt-4 grid gap-px border border-black bg-black sm:grid-cols-3">
            <div className="bg-white p-5">
              <p className="oma-label text-black/40">메시지</p>
              <p className="mt-2 font-serif text-3xl">{totalMessages}</p>
            </div>
            <div className="bg-white p-5">
              <p className="oma-label text-black/40">추정 비용</p>
              <p className="mt-2 font-serif text-3xl">
                {formatUsd(totalCost)}
              </p>
              <p className="mt-1 text-xs text-black/40">
                ≈ {formatKrw(totalCost)}
              </p>
            </div>
            <div className="bg-white p-5">
              <p className="oma-label text-black/40">멤버</p>
              <p className="mt-2 font-serif text-3xl">
                {members?.length ?? 0}
              </p>
            </div>
          </div>

          {usageRows.length > 0 && (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/15 text-left">
                  <th className="oma-label py-2 text-black/40">모델</th>
                  <th className="oma-label py-2 text-right text-black/40">
                    메시지
                  </th>
                  <th className="oma-label py-2 text-right text-black/40">
                    토큰 (in/out)
                  </th>
                  <th className="oma-label py-2 text-right text-black/40">
                    비용
                  </th>
                </tr>
              </thead>
              <tbody>
                {usageRows.map((r) => (
                  <tr key={r.model} className="border-b border-black/10">
                    <td className="py-2 font-mono text-xs">{r.model}</td>
                    <td className="py-2 text-right">{r.count}</td>
                    <td className="py-2 text-right font-mono text-xs text-black/55">
                      {r.tokensIn.toLocaleString()} /{" "}
                      {r.tokensOut.toLocaleString()}
                    </td>
                    <td className="py-2 text-right">{formatUsd(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 font-mono text-xs text-black/35">
            단가 기준: gemini-2.5-flash ${MODEL_RATES["gemini-2.5-flash"].inputPerM}
            /$
            {MODEL_RATES["gemini-2.5-flash"].outputPerM} per 1M tokens
          </p>
        </section>

        {/* ── 멤버 ───────────────────────────────────────────── */}
        <section className="mt-10">
          <p className="oma-label text-black/40">Members</p>
          <h2 className="mt-1 font-serif text-2xl">멤버</h2>

          <ul className="mt-4 divide-y border-y border-black/10">
            {(members ?? []).map((m) => {
              const isOwner = m.user_id === room.owner_id;
              const name = isOwner
                ? (nameMap.get(m.user_id) ?? "방장")
                : (nameMap.get(m.user_id) ?? "멤버");
              return (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="min-w-0">
                    <span className="text-sm">{name}</span>
                    <span className="ml-2 oma-label text-black/35">
                      {isOwner ? "방장" : m.role}
                    </span>
                    <p className="mt-0.5 font-mono text-xs text-black/35">
                      {fmtDate(m.joined_at)} · {m.joined_via}
                    </p>
                  </div>
                  {!isOwner && (
                    <form action={removeMember}>
                      <input type="hidden" name="room_id" value={room.id} />
                      <input
                        type="hidden"
                        name="user_id"
                        value={m.user_id}
                      />
                      <button
                        type="submit"
                        className="oma-label text-black/40 transition-colors hover:text-[var(--color-accent)]"
                      >
                        강퇴
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── 방 설정 ────────────────────────────────────────── */}
        <section className="mt-10">
          <p className="oma-label text-black/40">Settings</p>
          <h2 className="mt-1 font-serif text-2xl">방 설정</h2>

          <form action={updateRoomSettings} className="mt-4 space-y-5">
            <input type="hidden" name="room_id" value={room.id} />
            <input type="hidden" name="slug" value={room.slug ?? room.id} />

            <div className="space-y-2">
              <label className="oma-label block text-black/60">방 이름</label>
              <input
                name="name"
                defaultValue={room.name}
                required
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <label className="oma-label block text-black/60">설명</label>
              <textarea
                name="description"
                defaultValue={room.description ?? ""}
                rows={2}
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <label className="oma-label block text-black/60">
                시스템 프롬프트
              </label>
              <textarea
                name="system_prompt"
                defaultValue={room.system_prompt ?? ""}
                rows={4}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="oma-label block text-black/60">모델</label>
                <select
                  name="model"
                  defaultValue={room.model}
                  className={inputClass}
                >
                  <option value="gemini-2.5-flash">
                    Gemini 2.5 Flash — 균형
                  </option>
                  <option value="gemini-2.5-pro">
                    Gemini 2.5 Pro — 고품질
                  </option>
                  <option value="gemini-2.5-flash-lite">
                    Gemini 2.5 Flash-Lite — 최저비용
                  </option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="oma-label block text-black/60">민감도</label>
                <select
                  name="sensitivity"
                  defaultValue={room.sensitivity}
                  className={inputClass}
                >
                  <option value="public">public</option>
                  <option value="internal">internal</option>
                  <option value="confidential">confidential</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="oma-label block text-black/60">
                  top-k (검색 청크 수)
                </label>
                <input
                  name="top_k"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={room.top_k}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label className="oma-label block text-black/60">
                  temperature (0–1)
                </label>
                <input
                  name="temperature"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  defaultValue={room.temperature}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="border-t border-black/10 pt-5">
              <p className="oma-label text-black/40">쿼터</p>
              <div className="mt-3 grid gap-5 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="oma-label block text-black/60">
                    문서 수 (≤500)
                  </label>
                  <input
                    name="quota_docs"
                    type="number"
                    min={1}
                    max={500}
                    defaultValue={room.quota_docs}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <label className="oma-label block text-black/60">
                    용량 MB (≤2048)
                  </label>
                  <input
                    name="quota_mb"
                    type="number"
                    min={10}
                    max={2048}
                    defaultValue={Math.round(room.quota_bytes / 1024 / 1024)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <label className="oma-label block text-black/60">
                    일일 토큰 (≤5M)
                  </label>
                  <input
                    name="quota_daily_tokens"
                    type="number"
                    min={10000}
                    max={5000000}
                    step={10000}
                    defaultValue={room.quota_daily_tokens}
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-2 font-mono text-xs text-black/35">
                한도 강제는 W6에서 적용 — 현재는 설정만 저장됩니다.
              </p>
            </div>

            <button
              type="submit"
              className="group inline-flex h-11 items-center gap-2 border border-black bg-black px-5 text-sm font-bold text-white transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-md"
            >
              설정 저장
            </button>
          </form>
        </section>

        {/* ── 위험 구역 ──────────────────────────────────────── */}
        <section className="mt-10 border border-[var(--color-accent)] p-5">
          <p className="oma-label text-[var(--color-accent)]">Danger zone</p>
          <h2 className="mt-1 font-serif text-2xl">방 삭제</h2>
          <p className="mt-2 text-sm text-black/55">
            방을 삭제하면 목록에서 사라지고 <strong>30일 뒤 문서·대화·임베딩이
            영구 삭제</strong>됩니다. 30일 안에는 홈에서 복구할 수 있습니다.
          </p>
          <form action={softDeleteRoom} className="mt-4">
            <input type="hidden" name="room_id" value={room.id} />
            <ConfirmSubmit
              message="이 방을 삭제할까요? 30일 안에는 복구할 수 있습니다."
              className="border border-[var(--color-accent)] px-4 py-2.5 text-sm font-bold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-white"
            >
              방 삭제
            </ConfirmSubmit>
          </form>
        </section>
      </main>
    </div>
  );
}
