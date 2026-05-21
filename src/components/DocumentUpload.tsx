"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type State =
  | { kind: "idle" }
  | { kind: "preparing"; name: string }
  | { kind: "uploading"; name: string }
  | { kind: "indexing"; name: string }
  | { kind: "done"; name: string; dedup: boolean }
  | { kind: "error"; message: string };

const MAX_MB = 200;
const BUCKET = "dground-docs";

/** SHA-256 of the file, lower-case hex — matches the server's hash. */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function DocumentUpload({ roomId }: { roomId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function upload(file: File) {
    if (file.size > MAX_MB * 1024 * 1024) {
      setState({
        kind: "error",
        message: `파일이 ${MAX_MB}MB를 초과합니다 (${(
          file.size /
          1024 /
          1024
        ).toFixed(1)}MB).`,
      });
      return;
    }

    try {
      // 1. Hash the file so the server can dedup and key Storage.
      setState({ kind: "preparing", name: file.name });
      const hash = await sha256Hex(file);

      // 2. Ask for a signed upload URL (or learn it's already indexed).
      const urlRes = await fetch(
        `/api/rooms/${roomId}/documents/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hash,
            filename: file.name,
            size: file.size,
          }),
        },
      );
      const urlData = await urlRes
        .json()
        .catch(() => ({}) as Record<string, unknown>);
      if (!urlRes.ok) {
        setState({
          kind: "error",
          message:
            (urlData.error as string) ?? `업로드 준비 실패 (HTTP ${urlRes.status})`,
        });
        return;
      }

      // 3. Upload straight to Storage — unless the content already exists.
      if (!urlData.dedup) {
        setState({ kind: "uploading", name: file.name });
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(
            urlData.path as string,
            urlData.token as string,
            file,
            { contentType: "application/pdf" },
          );
        if (error) {
          setState({ kind: "error", message: `업로드 실패: ${error.message}` });
          return;
        }
      }

      // 4. Register + index the uploaded file.
      setState({ kind: "indexing", name: file.name });
      const regRes = await fetch(`/api/rooms/${roomId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, filename: file.name }),
      });
      const regData = await regRes
        .json()
        .catch(() => ({}) as Record<string, unknown>);
      if (!regRes.ok) {
        setState({
          kind: "error",
          message:
            (regData.error as string) ?? `색인 실패 (HTTP ${regRes.status})`,
        });
        return;
      }

      setState({ kind: "done", name: file.name, dedup: !!regData.dedup });
      router.refresh();
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  const busy =
    state.kind === "preparing" ||
    state.kind === "uploading" ||
    state.kind === "indexing";

  const busyLabel =
    state.kind === "preparing"
      ? "준비 중…"
      : state.kind === "uploading"
        ? "업로드 중…"
        : state.kind === "indexing"
          ? "색인 중…"
          : "+ PDF 업로드";

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
      <div className="flex items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="group inline-flex h-10 items-center gap-2 border border-black bg-black px-4 text-sm font-bold text-white transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:oma-shadow-sm disabled:opacity-50"
        >
          {busyLabel}
        </button>
        <span className="font-mono text-xs text-black/35">
          PDF · 최대 {MAX_MB}MB
        </span>
      </div>

      {state.kind === "preparing" && (
        <p className="mt-2 font-mono text-xs text-black/45">
          {state.name} — 파일 확인 중
        </p>
      )}
      {state.kind === "uploading" && (
        <p className="mt-2 font-mono text-xs text-black/45">
          {state.name} — 업로드 중 (대용량 파일은 수 분 소요될 수 있습니다)
        </p>
      )}
      {state.kind === "indexing" && (
        <p className="mt-2 font-mono text-xs text-black/45">
          {state.name} — 추출·임베딩 중 (문서 크기에 따라 수십 초~수 분 소요)
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
