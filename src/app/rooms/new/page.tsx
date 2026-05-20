import { redirect } from "next/navigation";
import Link from "next/link";
import Brandmark from "@/components/Brandmark";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/password";

const SENSITIVITIES = ["public", "internal", "confidential"] as const;

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
  const sensitivityRaw = String(formData.get("sensitivity") ?? "internal");
  const sensitivity = (SENSITIVITIES as readonly string[]).includes(
    sensitivityRaw,
  )
    ? sensitivityRaw
    : "internal";
  const password = String(formData.get("password") ?? "").trim();

  if (!name) redirect("/rooms/new?error=name_required");

  const { data: room, error } = await supabase
    .schema("dground")
    .from("rooms")
    .insert({
      name,
      description,
      system_prompt: systemPrompt,
      model,
      sensitivity,
      password_hash: password ? hashPassword(password) : null,
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
              placeholder="예: 논문 논의 방"
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
              placeholder="이 방의 목적, 다루는 문서 (예: 분야 핵심 논문 리뷰)"
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

          {/* ── 접근 설정 ───────────────────────────────────── */}
          <fieldset className="space-y-6 border border-black/15 p-5">
            <legend className="oma-label px-2 text-[var(--color-accent)]">
              접근 설정
            </legend>

            <p className="text-xs leading-relaxed text-black/50">
              모든 방은 <strong className="text-black/70">목록 비공개</strong>
              입니다 — 멤버만 접근할 수 있습니다. 멤버는 (1) 관리자가 직접
              초대하거나, (2) 아래 입장 비밀번호를 설정하면 방 링크 + 비밀번호로
              직접 입장할 수 있습니다.
            </p>

            <div className="space-y-2">
              <label className="oma-label block text-black/60">민감도</label>
              <select
                name="sensitivity"
                defaultValue="internal"
                className={inputClass}
              >
                <option value="public">public — 조직 내 공개 자료</option>
                <option value="internal">internal — 내부 자료 (기본)</option>
                <option value="confidential">
                  confidential — 기밀 (외부 공유 금지 프롬프트 자동 주입)
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="oma-label block text-black/60">
                입장 비밀번호 <span className="text-black/30">(선택)</span>
              </label>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                placeholder="설정하면 링크 + 비밀번호로 입장 허용"
              />
              <p className="text-xs text-black/45">
                비우면 <strong className="text-black/65">초대 전용</strong>{" "}
                방이 됩니다. 비밀번호는 해시로 저장되며 이후 관리자 콘솔에서
                변경할 수 있습니다.
              </p>
            </div>
          </fieldset>

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
