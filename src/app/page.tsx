import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/super-admin";
import { restoreRoom } from "./actions";
import Brandmark from "@/components/Brandmark";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import SignOutButton from "@/components/SignOutButton";

const STEPS = [
  {
    n: "01",
    title: "방을 연다",
    body: "문서 코퍼스를 가진 나만의 RAG 챗봇 공간(Room)을 개설합니다.",
  },
  {
    n: "02",
    title: "문서를 올린다",
    body: "PDF를 ground 삼아 자동 색인 — 답변은 항상 출처와 함께.",
  },
  {
    n: "03",
    title: "팀을 초대한다",
    body: "초대 링크 또는 비밀번호로 멤버를 받아 같은 장에서 대화합니다.",
  },
];

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rooms: Array<{
    id: string;
    slug: string | null;
    name: string;
    description: string | null;
    model: string;
  }> | null = null;
  let roomsError = false;

  let deletedRooms: { id: string; name: string; deleted_at: string }[] = [];

  if (user) {
    const { data, error } = await supabase
      .schema("dground")
      .from("rooms")
      .select("id, slug, name, description, model, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) roomsError = true;
    else rooms = data;

    // Owner's soft-deleted rooms still within the 30-day grace window.
    const { data: del } = await supabase
      .schema("dground")
      .from("rooms")
      .select("id, name, deleted_at")
      .eq("owner_id", user.id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    deletedRooms = del ?? [];
  }

  return (
    <div className="min-h-screen">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 sm:px-10">
        <Brandmark />
        {user ? (
          <div className="flex items-center gap-4">
            <span className="hidden font-mono text-xs text-black/40 sm:block">
              {user.email}
            </span>
            {isSuperAdmin(user.email) && (
              <Link
                href="/admin"
                className="oma-label text-black/40 transition-colors hover:text-black"
              >
                운영
              </Link>
            )}
            <SignOutButton />
          </div>
        ) : (
          <a
            href="https://dconnect.kr"
            className="oma-label text-black/40 transition-colors hover:text-black"
          >
            d.connect ↗
          </a>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:px-10 sm:pt-24">
        <p className="oma-label oma-fade text-[var(--color-accent)]">
          Multi-tenant RAG Chatbot Platform
        </p>
        <h1 className="oma-fade mt-5 max-w-3xl font-serif text-4xl leading-[1.1] tracking-tight sm:text-6xl">
          Ground your team&apos;s questions in real documents.
        </h1>
        <div className="oma-fade mt-6 h-px w-20 bg-black" />
        <p className="oma-fade mt-6 max-w-xl text-base leading-relaxed text-black/60 sm:text-lg">
          SCI급 논문, API 레퍼런스·디자인 시스템 문서, 사내 매뉴얼을 올리면
          <br className="hidden sm:block" />
          팀 전용 RAG 챗봇이 <strong className="font-semibold text-black">
            환각 없이 출처와 함께
          </strong>{" "}
          답합니다.
        </p>
      </section>

      {/* ── Action zone — login OR rooms ──────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-20 sm:px-10">
        {!user && (
          <div className="oma-fade">
            <GoogleAuthButton next="/" />
            <p className="mt-3 font-mono text-xs text-black/40">
              d.connect 라인업 공유 계정 — 별도 가입 없이 바로 시작합니다.
            </p>

            {/* How it works */}
            <div className="mt-16">
              <p className="oma-label text-black/40">How it works</p>
              <div className="mt-5 grid gap-px border border-black bg-black sm:grid-cols-3">
                {STEPS.map((s) => (
                  <div key={s.n} className="bg-white p-6">
                    <span className="font-mono text-2xl font-bold text-[var(--color-accent)]">
                      {s.n}
                    </span>
                    <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-black/55">
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {user && (
          <div className="oma-fade">
            <div className="flex items-end justify-between border-b border-black/10 pb-3">
              <div>
                <p className="oma-label text-black/40">내 방</p>
                <h2 className="mt-1 font-serif text-2xl">
                  Rooms{" "}
                  <span className="text-black/30">
                    {rooms ? rooms.length : 0}
                  </span>
                </h2>
              </div>
              <Link
                href="/rooms/new"
                className="group inline-flex h-10 items-center gap-2 border border-black bg-black px-4 text-sm font-bold text-white transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-sm"
              >
                <span className="text-lg leading-none">+</span> 새 방
              </Link>
            </div>

            {roomsError && (
              <div className="mt-6 border-l-4 border-l-[var(--color-accent)] bg-white p-5 oma-shadow-sm">
                <p className="text-sm font-bold">DB 설정이 아직 안 됐습니다.</p>
                <p className="mt-1 text-sm text-black/55">
                  Supabase SQL Editor에서 마이그레이션(
                  <code className="font-mono text-xs">
                    0001_dground_init.sql
                  </code>
                  )을 먼저 실행하세요. 자세한 내용은 SETUP.md 참고.
                </p>
              </div>
            )}

            {!roomsError && rooms && rooms.length > 0 && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rooms.map((r) => (
                  <Link
                    key={r.id}
                    href={`/rooms/${r.slug ?? r.id}` as never}
                    className="oma-card block p-5"
                  >
                    <h3 className="font-bold">{r.name}</h3>
                    {r.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-black/55">
                        {r.description}
                      </p>
                    )}
                    <p className="oma-label mt-4 text-black/30">{r.model}</p>
                  </Link>
                ))}
              </div>
            )}

            {!roomsError && rooms && rooms.length === 0 && (
              <Link
                href="/rooms/new"
                className="mt-6 block border border-dashed border-black/30 p-12 text-center transition-colors hover:border-black hover:bg-white"
              >
                <p className="text-sm text-black/50">
                  아직 방이 없습니다. 첫 방을 만들어 문서를 ground 삼아 보세요.
                </p>
                <p className="mt-2 oma-label text-[var(--color-accent)]">
                  + 새 방 만들기
                </p>
              </Link>
            )}

            {deletedRooms.length > 0 && (
              <div className="mt-12">
                <p className="oma-label text-black/40">삭제 예정</p>
                <ul className="mt-3 divide-y border-y border-black/10">
                  {deletedRooms.map((r) => {
                    const daysLeft = Math.max(
                      0,
                      30 -
                        Math.floor(
                          (Date.now() - new Date(r.deleted_at).getTime()) /
                            86400000,
                        ),
                    );
                    return (
                      <li
                        key={r.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div className="min-w-0">
                          <span className="text-sm text-black/55 line-through">
                            {r.name}
                          </span>
                          <p className="mt-0.5 font-mono text-xs text-black/35">
                            {daysLeft}일 후 영구 삭제
                          </p>
                        </div>
                        <form action={restoreRoom}>
                          <input type="hidden" name="room_id" value={r.id} />
                          <button
                            type="submit"
                            className="oma-label text-black/40 transition-colors hover:text-[var(--color-accent)]"
                          >
                            복구
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-black/10 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <p className="font-mono text-xs text-black/40">
            d.ground — Ground your conversation in documents.
          </p>
          <p className="font-mono text-xs text-black/30">
            d.connect family · dconnect.kr
          </p>
        </div>
      </footer>
    </div>
  );
}
