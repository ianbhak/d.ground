"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Catches errors thrown within a route segment — recoverable via reset(). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="oma-label text-[var(--color-accent)]">Something broke</p>
      <h1 className="mt-4 font-serif text-4xl tracking-tight sm:text-5xl">
        문제가 발생했습니다
      </h1>
      <div className="mt-6 h-px w-20 bg-black" />
      <p className="mt-6 max-w-md text-sm leading-relaxed text-black/55">
        잠시 후 다시 시도해 주세요. 계속되면 새로고침 해 주세요.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-black/30">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center border border-black bg-black px-4 text-sm font-bold text-white transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-sm"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center border border-black px-4 text-sm font-bold transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-sm"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
