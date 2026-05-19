import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!room) notFound();

  return (
    <main className="mx-auto max-w-3xl px-8 py-12">
      <Link
        href="/rooms"
        className="mb-8 inline-block text-sm text-[var(--color-ground-muted)] hover:text-black"
      >
        ← 내 방으로
      </Link>

      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-light tracking-tight">{room.name}</h1>
        {room.description && (
          <p className="text-[var(--color-ground-muted)]">{room.description}</p>
        )}
        <div className="flex gap-3 pt-2 text-xs text-[var(--color-ground-muted)]">
          <span>{room.model}</span>
          <span>·</span>
          <span>{room.sensitivity}</span>
        </div>
      </header>

      <div className="border border-dashed py-16 text-center text-sm text-[var(--color-ground-muted)]">
        W2 작업 — 문서 업로드 & 채팅 UI는 다음 단계에서 추가됩니다.
      </div>
    </main>
  );
}
