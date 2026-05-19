import { redirect } from "next/navigation";
import Link from "next/link";
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

  if (!name) {
    redirect("/rooms/new?error=name_required");
  }

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
    redirect(`/rooms/new?error=${encodeURIComponent(error?.message ?? "unknown")}`);
  }

  // owner is automatically Room Admin via memberships
  await supabase.schema("dground").from("memberships").insert({
    room_id: room.id,
    user_id: user.id,
    role: "admin",
    joined_via: "owner",
  });

  redirect(`/rooms/${room.id}`);
}

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-xl px-8 py-12">
      <Link
        href="/rooms"
        className="mb-8 inline-block text-sm text-[var(--color-ground-muted)] hover:text-black"
      >
        ← 내 방으로
      </Link>

      <h1 className="mb-8 text-2xl font-light tracking-tight">새 방 만들기</h1>

      {error && (
        <div className="mb-6 border border-black bg-neutral-50 px-4 py-3 text-sm">
          오류: {error}
        </div>
      )}

      <form action={createRoom} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium">방 이름</label>
          <input
            name="name"
            required
            className="w-full border border-black px-3 py-2 outline-none focus:bg-neutral-50"
            placeholder="예: 성수3 입찰 검토방"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">설명 (선택)</label>
          <textarea
            name="description"
            rows={3}
            className="w-full border border-black px-3 py-2 outline-none focus:bg-neutral-50"
            placeholder="이 방의 목적, 어떤 문서를 다루는지"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">시스템 프롬프트</label>
          <textarea
            name="system_prompt"
            rows={5}
            className="w-full border border-black px-3 py-2 font-mono text-sm outline-none focus:bg-neutral-50"
            placeholder="이 방의 챗봇이 따를 지침. 비워두면 기본값 사용."
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">모델</label>
          <select
            name="model"
            defaultValue="claude-sonnet-4-6"
            className="w-full border border-black px-3 py-2 outline-none focus:bg-neutral-50"
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
          className="w-full border border-black bg-black px-4 py-3 text-white hover:bg-white hover:text-black transition"
        >
          방 만들기
        </button>
      </form>
    </main>
  );
}
