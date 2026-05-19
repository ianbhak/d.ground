"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const redirectTo = params.get("redirect") ?? "/rooms";

  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-8 px-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-light tracking-tight">d.ground</h1>
        <div className="h-px w-16 bg-black" />
        <p className="text-sm text-[var(--color-ground-muted)]">
          Sign in to continue.
        </p>
      </div>

      <button
        onClick={signInWithGoogle}
        className="w-full border border-black px-6 py-3 text-sm tracking-wide hover:bg-black hover:text-white transition"
      >
        Continue with Google
      </button>

      <p className="text-xs text-[var(--color-ground-muted)]">
        d.connect 라인업 공유 계정 — d.connect에서 가입한 사용자도 같은 계정으로 입장합니다.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
