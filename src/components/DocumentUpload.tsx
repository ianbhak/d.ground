"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type State =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "done"; name: string; dedup: boolean }
  | { kind: "error"; message: string };

export default function DocumentUpload({ roomId }: { roomId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function upload(file: File) {
    setState({ kind: "uploading", name: file.name });
    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch(`/api/rooms/${roomId}/documents`, {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        setState({
          kind: "error",
          message: data.error ?? `업로드 실패 (HTTP ${res.status})`,
        });
        return;
      }
      setState({ kind: "done", name: file.name, dedup: !!data.dedup });
      router.refresh();
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  const busy = state.kind === "uploading";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group inline-flex h-10 items-center gap-2 border border-black bg-black px-4 text-sm font-bold text-white transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-sm disabled:opacity-50"
      >
        {busy ? "색인 중…" : "+ PDF 업로드"}
      </button>

      {state.kind === "uploading" && (
        <p className="mt-2 font-mono text-xs text-black/45">
          {state.name} — 추출·임베딩 중 (문서 크기에 따라 수십 초 소요)
        </p>
      )}
      {state.kind === "done" && (
        <p className="mt-2 font-mono text-xs text-black/55">
          ✓ {state.name}
          {state.dedup ? " — 기존 색인 재사용 (dedup)" : " — 색인 완료"}
        </p>
      )}
      {state.kind === "error" && (
        <p className="mt-2 font-mono text-xs text-[var(--color-accent)]">
          ✗ {state.message}
        </p>
      )}
    </div>
  );
}
