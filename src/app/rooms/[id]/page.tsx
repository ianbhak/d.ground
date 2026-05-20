import Link from "next/link";
import { notFound } from "next/navigation";
import Brandmark from "@/components/Brandmark";
import InviteLinkCard from "@/components/InviteLinkCard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!room) notFound();

  const isOwner = user?.id === room.owner_id;

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

      <main className="mx-auto max-w-4xl px-6 py-14 oma-fade sm:px-10">
        <p className="oma-label text-[var(--color-accent)]">Room</p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">{room.name}</h1>
        {room.description && (
          <p className="mt-3 max-w-xl text-black/60">{room.description}</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="oma-label border border-black/15 px-2.5 py-1 text-black/50">
            {room.model}
          </span>
          <span className="oma-label border border-black/15 px-2.5 py-1 text-black/50">
            {room.sensitivity}
          </span>
        </div>

        <div className="mt-8">
          <InviteLinkCard
            roomId={room.id}
            joinToken={room.join_token}
            isOwner={isOwner}
          />
        </div>

        <div className="mt-8 grid gap-px border border-black bg-black sm:grid-cols-3">
          {[
            { label: "문서", value: "0", hint: "W2 — 업로드 예정" },
            { label: "멤버", value: "1", hint: "방장 (나)" },
            { label: "스레드", value: "0", hint: "W3 — 채팅 예정" },
          ].map((s) => (
            <div key={s.label} className="bg-white p-5">
              <p className="oma-label text-black/40">{s.label}</p>
              <p className="mt-2 font-serif text-3xl">{s.value}</p>
              <p className="mt-1 text-xs text-black/40">{s.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 border border-dashed border-black/30 p-12 text-center">
          <p className="oma-label text-black/40">Coming in W2 / W3</p>
          <p className="mt-2 text-sm text-black/55">
            문서 업로드 · RAG 채팅 UI는 다음 단계에서 추가됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
