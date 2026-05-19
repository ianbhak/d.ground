import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/rooms");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-8 px-8">
      <div className="space-y-3">
        <h1 className="text-5xl font-light tracking-tight">d.ground</h1>
        <div className="h-px w-24 bg-black" />
        <p className="text-lg text-[var(--color-ground-muted)]">
          Ground your conversation in documents.
        </p>
        <p className="text-base text-[var(--color-ground-muted)]">
          문서에 발 디딘 대화 — 도메인 문서 기반 멀티테넌트 RAG 챗봇 플랫폼.
        </p>
      </div>

      <Link
        href="/login"
        className="inline-block border border-black px-6 py-3 text-sm tracking-wide hover:bg-black hover:text-white transition"
      >
        Sign in with Google →
      </Link>

      <footer className="mt-auto pb-8 text-xs text-[var(--color-ground-muted)]">
        Part of the d.connect family · dconnect.kr
      </footer>
    </main>
  );
}
