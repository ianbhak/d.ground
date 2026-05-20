"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function GoogleAuthButton({
  next = "/",
  variant = "solid",
}: {
  next?: string;
  variant?: "solid" | "outline";
}) {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setLoading(false);
  }

  const base =
    "group inline-flex items-center justify-center gap-3 h-12 px-6 text-sm font-bold border border-black transition-all disabled:opacity-50";
  const styles =
    variant === "solid"
      ? "bg-black text-white hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-md"
      : "bg-white text-black hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-md";

  return (
    <button onClick={signIn} disabled={loading} className={`${base} ${styles}`}>
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
        <path
          fill="currentColor"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.63Z"
        />
        <path
          fill="currentColor"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="currentColor"
          d="M3.97 10.72A5.4 5.4 0 0 1 3.97 7.3V4.96H.96a9 9 0 0 0 0 8.09l3.01-2.33Z"
        />
        <path
          fill="currentColor"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
      {loading ? "이동 중…" : "Continue with Google"}
      <span className="transition-transform group-hover:translate-x-0.5">→</span>
    </button>
  );
}
