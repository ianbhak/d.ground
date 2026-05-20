import { Suspense } from "react";
import { redirect } from "next/navigation";
import Brandmark from "@/components/Brandmark";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  const { redirect: next, error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm oma-fade">
        <div className="mb-10 flex justify-center">
          <Brandmark />
        </div>

        <div className="border border-black bg-white p-8 oma-shadow-lg">
          <p className="oma-label text-[var(--color-accent)]">Sign in</p>
          <h1 className="mt-3 font-serif text-2xl leading-snug">
            문서에 발 디딘 대화를 시작하세요.
          </h1>
          <p className="mt-2 text-sm text-black/55">
            d.connect 라인업 공유 계정으로 입장합니다.
          </p>

          {error && (
            <div className="mt-5 border-l-4 border-l-[var(--color-accent)] bg-[var(--color-paper)] px-3 py-2 text-xs text-black/70">
              로그인에 실패했습니다. 다시 시도해 주세요.
            </div>
          )}

          <div className="mt-6">
            <GoogleAuthButton next={next ?? "/"} />
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-xs text-black/35">
          d.connect family · dconnect.kr
        </p>
      </div>
    </main>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  return (
    <Suspense>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
