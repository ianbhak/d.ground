import Link from "next/link";
import { notFound } from "next/navigation";
import Brandmark from "@/components/Brandmark";
import InviteLinkCard from "@/components/InviteLinkCard";
import DocumentUpload from "@/components/DocumentUpload";
import RoomChatTabs from "@/components/RoomChatTabs";
import { type ChatMessage } from "@/components/RoomChat";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid, decodeRoomParam } from "@/lib/slug";
import { detachDocument } from "./actions";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "색인 중",
  indexed: "색인 완료",
  failed: "실패",
};

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeRoomParam(rawId);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: room } = await supabase
    .schema("dground")
    .from("rooms")
    .select("*")
    .eq(isUuid(id) ? "id" : "slug", id)
    .is("deleted_at", null)
    .single();

  if (!room) notFound();

  const isOwner = user?.id === room.owner_id;

  const { data: docsRaw } = await supabase
    .schema("dground")
    .from("room_documents")
    .select(
      "id, display_filename, attached_at, shared_documents(status, byte_size)",
    )
    .eq("room_id", room.id)
    .order("attached_at", { ascending: false });

  const docs = (docsRaw ?? []).map((d) => {
    const sd = Array.isArray(d.shared_documents)
      ? d.shared_documents[0]
      : d.shared_documents;
    return {
      id: d.id as string,
      name: d.display_filename as string,
      status: (sd?.status as string) ?? "pending",
      bytes: (sd?.byte_size as number) ?? 0,
    };
  });

  const hasIndexedDocs = docs.some((d) => d.status === "indexed");

  // Load chat history for both threads (private 1:1 + room-wide shared).
  let privateMessages: ChatMessage[] = [];
  let sharedMessages: ChatMessage[] = [];
  let sharedThreadId: string | undefined;

  if (user) {
    const { data: threads } = await supabase
      .schema("dground")
      .from("threads")
      .select("id, visibility, user_id")
      .eq("room_id", room.id);

    const privateThread = (threads ?? []).find(
      (t) => t.visibility === "private" && t.user_id === user.id,
    );
    const sharedThread = (threads ?? []).find(
      (t) => t.visibility === "shared",
    );
    sharedThreadId = sharedThread?.id;

    const asMessages = (
      rows: {
        id: string;
        role: string;
        content: string;
        sources: unknown;
        sender_id: string | null;
        sender_name: string | null;
      }[],
    ): ChatMessage[] =>
      rows.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        sources: Array.isArray(m.sources)
          ? (m.sources as {
              filename: string;
              page: number | null;
              thumb?: string | null;
            }[])
          : [],
        mine: m.role === "assistant" ? false : m.sender_id === user.id,
        senderName: m.sender_name ?? undefined,
      }));

    const selectCols = "id, role, content, sources, sender_id, sender_name";

    if (privateThread) {
      const { data: msgs } = await supabase
        .schema("dground")
        .from("messages")
        .select(selectCols)
        .eq("thread_id", privateThread.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      privateMessages = asMessages(msgs ?? []);
    }

    if (sharedThread) {
      const { data: msgs } = await supabase
        .schema("dground")
        .from("messages")
        .select(selectCols)
        .eq("thread_id", sharedThread.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      sharedMessages = asMessages(msgs ?? []);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 sm:px-10">
        <Brandmark />
        <div className="flex items-center gap-4">
          {isOwner && (
            <Link
              href={`/rooms/${room.slug ?? room.id}/admin` as never}
              className="oma-label text-black/40 transition-colors hover:text-black"
            >
              관리
            </Link>
          )}
          <Link
            href="/"
            className="oma-label text-black/40 transition-colors hover:text-black"
          >
            ← 내 방
          </Link>
        </div>
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

        {/* ── Documents ──────────────────────────────────────── */}
        <section className="mt-10">
          <div className="flex items-end justify-between border-b border-black/10 pb-3">
            <div>
              <p className="oma-label text-black/40">Ground</p>
              <h2 className="mt-1 font-serif text-2xl">
                문서 <span className="text-black/30">{docs.length}</span>
              </h2>
            </div>
            {isOwner && <DocumentUpload roomId={room.id} />}
          </div>

          {docs.length > 0 ? (
            <details className="group mt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between border-y border-black/10 py-3 [&::-webkit-details-marker]:hidden">
                <span className="oma-label text-black/50">
                  업로드된 문서 {docs.length}개
                </span>
                <span className="font-mono text-xs text-black/40 transition-transform group-open:rotate-90">
                  ▸
                </span>
              </summary>
              <ul className="divide-y border-b border-black/10">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-3"
                  >
                    <span className="min-w-0 truncate pr-4 text-sm">
                      {d.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-xs text-black/35">
                        {formatBytes(d.bytes)}
                      </span>
                      <span
                        className={`oma-label ${
                          d.status === "failed"
                            ? "text-[var(--color-accent)]"
                            : d.status === "indexed"
                              ? "text-black/50"
                              : "text-black/35"
                        }`}
                      >
                        {STATUS_LABEL[d.status] ?? d.status}
                      </span>
                      {isOwner && (
                        <form action={detachDocument}>
                          <input
                            type="hidden"
                            name="room_id"
                            value={room.id}
                          />
                          <input
                            type="hidden"
                            name="room_document_id"
                            value={d.id}
                          />
                          <button
                            type="submit"
                            className="oma-label text-black/30 transition-colors hover:text-[var(--color-accent)]"
                          >
                            제거
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <div className="mt-4 border border-dashed border-black/30 p-12 text-center text-sm text-black/50">
              {isOwner
                ? "PDF를 업로드해 이 방의 ground를 만드세요."
                : "아직 업로드된 문서가 없습니다."}
            </div>
          )}
        </section>

        {/* ── Chat ───────────────────────────────────────────── */}
        <section className="mt-10">
          <div className="border-b border-black/10 pb-3">
            <p className="oma-label text-black/40">Chat</p>
            <h2 className="mt-1 font-serif text-2xl">내 채팅</h2>
          </div>
          <div className="mt-4">
            <RoomChatTabs
              roomId={room.id}
              hasDocuments={hasIndexedDocs}
              currentUserId={user?.id ?? ""}
              sharedThreadId={sharedThreadId}
              privateMessages={privateMessages}
              sharedMessages={sharedMessages}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
