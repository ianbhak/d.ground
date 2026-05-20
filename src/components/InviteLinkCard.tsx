"use client";

import { useState } from "react";
import { regenerateJoinToken } from "@/app/rooms/[id]/actions";

export default function InviteLinkCard({
  roomId,
  joinToken,
  isOwner,
}: {
  roomId: string;
  joinToken: string;
  isOwner: boolean;
}) {
  const [token, setToken] = useState(joinToken);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${token}`
      : `/join/${token}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function regenerate() {
    if (
      !confirm(
        "링크를 재발급하면 기존 링크는 즉시 무효화됩니다. 이미 입장한 멤버는 영향받지 않습니다. 계속할까요?",
      )
    )
      return;
    setBusy(true);
    try {
      const next = await regenerateJoinToken(roomId);
      setToken(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-black bg-white p-5 oma-shadow-sm">
      <p className="oma-label text-[var(--color-accent)]">초대 링크</p>
      <p className="mt-2 text-sm text-black/55">
        이 링크를 받은 사람만 로그인 후 이 방에 입장할 수 있습니다.
      </p>

      <div className="mt-4 flex items-stretch border border-black">
        <input
          readOnly
          value={link}
          className="min-w-0 flex-1 bg-[var(--color-paper)] px-3 py-2 font-mono text-xs outline-none"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          onClick={copy}
          className="shrink-0 border-l border-black bg-black px-4 text-xs font-bold text-white transition-colors hover:bg-black/80"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>

      {isOwner && (
        <button
          onClick={regenerate}
          disabled={busy}
          className="oma-label mt-3 text-black/40 transition-colors hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          {busy ? "재발급 중…" : "↻ 링크 재발급"}
        </button>
      )}
    </div>
  );
}
