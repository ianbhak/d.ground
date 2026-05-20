import { redirect } from "next/navigation";
import Link from "next/link";
import Brandmark from "@/components/Brandmark";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function createRoom(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const systemPrompt = String(formData.get("system_prompt") ?? "").trim();
  const model = String(formData.get("model") ?? "claude-sonnet-4-6");

  if (!name) redirect("/rooms/new?error=name_required");

  const { data: room, error } = await supabase
    .schema("dground")
    .from("rooms")
    .insert({
      name,
      description,
      system_prompt: systemPrompt,
      model,
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (error || !room) {
    redirect(
      `/rooms/new?error=${encodeURIComponent(error?.message ?? "unknown")}`,
    );
  }

  await supabase.schema("dground").from("memberships").insert({
    room_id: room.id,
    user_id: user.id,
    role: "admin",
    joined_via: "owner",
  });

  redirect(`/rooms/${room.id}`);
}

const inputClass =
  "w-full border border-black bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]";

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 sm:px-10">
        <Brandmark />
        <Link
          href="/"
          className="oma-label text-black/40 transition-colors hover:text-black"
        >
          ← 내 방
        </Link>
      </header>

      <main className="mx-auto max-w-xl px-6 py-14 oma-fade">
        <p className="oma-label text-[var(--color-accent)]">New Room</p>
        <h1 className="mt-3 font-serif text-3xl tracking-tight">
          새 방 만들기
        </h1>
        <p className="mt-2 text-sm text-black/55">
          문서를 ground 삼는 독립 RAG 챗봇 공간을 개설합니다.
        </p>

        {error && (
          <div className="mt-6 border-l-4 border-l-[var(--color-accent)] bg-white px-4 py-3 text-sm oma-shadow-sm">
            {error === "name_required"
              ? "방 이름을 입력해 주세요."
              : `오류: ${error}`}
          </div>
        )}

        <form action={createRoom} className="mt-8 space-y-6">
          <div className="space-y-2">
            <label className="oma-label block text-black/60">방 이름</label>
            <input
              name="name"
              required
              className={inputClass}
              placeholder="예: 성수3 입찰 검토방"
            />
          </div>

          <div className="space-y-2">
            <label className="oma-label block text-black/60">
              설명 <span className="text-black/30">(선택)</span>
            </label>
            <textarea
              name="description"
              rows={3}
              className={inputClass}
              placeholder="이 방의 목적, 다루는 문서"
            />
          </div>

          <div className="space-y-2">
            <label className="oma-label block text-black/60">
              시스템 프롬프트
            </label>
            <textarea
              name="system_prompt"
              rows={5}
              className={`${inputClass} font-mono`}
              placeholder="챗봇이 따를 지침. 비워두면 기본값 사용."
            />
          </div>

          <div className="space-y-2">
            <label className="oma-label block text-black/60">모델</label>
            <select
              name="model"
              defaultValue="claude-sonnet-4-6"
              className={inputClass}
            >
              <option value="claude-sonnet-4-6">
                Claude Sonnet 4.6 — 균형 (기본)
              </option>
              <option value="claude-opus-4-7">
                Claude Opus 4.7 — 고품질·고비용
              </option>
              <option value="claude-haiku-4-5">
                Claude Haiku 4.5 — 빠름·저비용
              </option>
            </select>
          </div>

          <button
            type="submit"
            className="group inline-flex h-12 w-full items-center justify-center gap-2 border border-black bg-black text-sm font-bold text-white transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-md"
          >
            방 만들기
            <span className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </form>
      </main>
    </div>
  );
}
