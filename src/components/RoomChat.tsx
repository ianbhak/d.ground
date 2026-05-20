"use client";

import { useEffect, useRef, useState } from "react";

interface Source {
  filename: string;
  page: number | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

function dedupeSources(sources?: Source[]): string[] {
  if (!sources) return [];
  const seen = new Set<string>();
  for (const s of sources) {
    seen.add(s.page ? `${s.filename} p.${s.page}` : s.filename);
  }
  return [...seen];
}

export default function RoomChat({
  roomId,
  initialMessages,
  hasDocuments,
}: {
  roomId: string;
  initialMessages: ChatMessage[];
  hasDocuments: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setSending(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "오류가 발생했습니다.");
        return;
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-black bg-white">
      {/* Messages */}
      <div className="max-h-[460px] min-h-[220px] space-y-5 overflow-y-auto p-5">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-black/40">
            {hasDocuments
              ? "문서에 대해 무엇이든 물어보세요."
              : "먼저 PDF를 업로드하면 문서 기반으로 답변할 수 있습니다."}
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            <p className="oma-label mb-1 text-black/35">
              {m.role === "user" ? "나" : "d.ground"}
            </p>
            <div
              className={
                m.role === "user"
                  ? "border-l-2 border-l-black pl-3 text-sm"
                  : "border-l-2 border-l-[var(--color-accent)] pl-3 text-sm leading-relaxed"
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === "assistant" && dedupeSources(m.sources).length > 0 && (
                <p className="mt-2 font-mono text-xs text-black/40">
                  출처: {dedupeSources(m.sources).join(" · ")}
                </p>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div>
            <p className="oma-label mb-1 text-black/35">d.ground</p>
            <p className="border-l-2 border-l-[var(--color-accent)] pl-3 text-sm text-black/40">
              문서를 검색하고 답변을 생성하는 중…
            </p>
          </div>
        )}

        {error && (
          <p className="font-mono text-xs text-[var(--color-accent)]">
            ✗ {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex items-stretch border-t border-black">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="질문을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          className="min-w-0 flex-1 resize-none px-3 py-3 text-sm outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="shrink-0 border-l border-black bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-black/80 disabled:opacity-40"
        >
          전송
        </button>
      </div>
    </div>
  );
}
