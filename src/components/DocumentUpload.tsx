"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  preparePdfForUpload,
  type PreparePhase,
  type PreparedPart,
} from "@/lib/pdf-prepare";

type State =
  | { kind: "idle" }
  | { kind: "processing"; name: string; detail: string }
  | { kind: "uploading"; name: string; detail: string }
  | { kind: "done"; name: string; parts: number; dedup: boolean }
  | { kind: "error"; message: string };

const MAX_MB = 32;
const BUCKET = "dground-docs";

/** SHA-256 of the blob, lower-case hex — matches the server's hash. */
async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function phaseLabel(phase: PreparePhase): string {
  return phase.kind === "rendering"
    ? `페이지 변환 중 ${phase.page}/${phase.total}`
    : `압축본 생성 중 (${phase.part})`;
}

export default function DocumentUpload({ roomId }: { roomId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  /** Upload one prepared part: hash → signed URL → Storage → index. */
  async function uploadPart(
    part: PreparedPart,
    displayName: string,
    suffix: string,
  ): Promise<{ dedup: boolean }> {
    const hash = await sha256Hex(part.blob);

    // Ask for a signed upload URL (or learn the content is already indexed).
    const urlRes = await fetch(`/api/rooms/${roomId}/documents/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hash,
        filename: part.filename,
        size: part.blob.size,
      }),
    });
    const urlData = await urlRes
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    if (!urlRes.ok) {
      throw new Error(
        (urlData.error as string) ?? `업로드 준비 실패 (HTTP ${urlRes.status})`,
      );
    }

    // Upload straight to Storage — unless the content already exists.
    if (!urlData.dedup) {
      setState({ kind: "uploading", name: displayName, detail: `업로드 중${suffix}` });
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(
          urlData.path as string,
          urlData.token as string,
          part.blob,
          { contentType: "application/pdf" },
        );
      if (error) throw new Error(`업로드 실패: ${error.message}`);
    }

    // Register + index the uploaded file.
    setState({ kind: "uploading", name: displayName, detail: `색인 중${suffix}` });
    const regRes = await fetch(`/api/rooms/${roomId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash, filename: part.filename }),
    });
    const regData = await regRes
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    if (!regRes.ok) {
      throw new Error(
        (regData.error as string) ?? `색인 실패 (HTTP ${regRes.status})`,
      );
    }
    return { dedup: !!regData.dedup };
  }

  async function handleFile(file: File) {
    try {
      // Oversized files are rasterised + split client-side so they fit
      // the Storage limit; files within the limit pass through untouched.
      let parts: PreparedPart[];
      if (file.size > MAX_MB * 1024 * 1024) {
        setState({ kind: "processing", name: file.name, detail: "분석 중…" });
        parts = await preparePdfForUpload(file, (phase) =>
          setState({
            kind: "processing",
            name: file.name,
            detail: phaseLabel(phase),
          }),
        );
      } else {
        parts = [{ blob: file, filename: file.name }];
      }

      let lastDedup = false;
      for (let i = 0; i < parts.length; i++) {
        const suffix = parts.length > 1 ? ` (${i + 1}/${parts.length})` : "";
        const { dedup } = await uploadPart(parts[i], file.name, suffix);
        lastDedup = dedup;
      }

      setState({
        kind: "done",
        name: file.name,
        parts: parts.length,
        dedup: parts.length === 1 && lastDedup,
      });
      router.refresh();
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  const busy = state.kind === "processing" || state.kind === "uploading";

  const busyLabel =
    state.kind === "processing"
      ? "압축 중…"
      : state.kind === "uploading"
        ? "업로드 중…"
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
          if (f) handleFile(f);
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
          PDF · {MAX_MB}MB 초과 시 자동 압축·분할
        </span>
      </div>

      {state.kind === "processing" && (
        <p className="mt-2 font-mono text-xs text-black/45">
          {state.name} — {state.detail}
        </p>
      )}
      {state.kind === "uploading" && (
        <p className="mt-2 font-mono text-xs text-black/45">
          {state.name} — {state.detail}
        </p>
      )}
      {state.kind === "done" && (
        <p className="mt-2 font-mono text-xs text-black/55">
          ✓ {state.name}
          {state.parts > 1
            ? ` — ${state.parts}개 파일로 분할 업로드 완료`
            : state.dedup
              ? " — 기존 색인 재사용 (dedup)"
              : " — 색인 완료"}
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
