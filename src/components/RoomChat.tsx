"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Source {
  filename: string;
  page: number | null;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  mine?: boolean;
  senderName?: string;
}

export type ChatMode = "private" | "shared";

const MAX_SOURCES = 3;

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
  mode,
  initialMessages,
  hasDocuments,
  currentUserId,
  sharedThreadId,
}: {
  roomId: string;
  mode: ChatMode;
  initialMessages: ChatMessage[];
  hasDocuments: boolean;
  currentUserId: string;
  sharedThreadId?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(
    new Set<string>(
      initialMessages.map((m) => m.id).filter((x): x is string => !!x),
    ),
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Live updates for the shared thread — other members' messages.
  useEffect(() => {
    if (mode !== "shared" || !sharedThreadId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`shared-${sharedThreadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "dground",
          table: "messages",
          filter: `thread_id=eq.${sharedThreadId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            role: "user" | "assistant";
            content: string;
            sources: unknown;
            sender_id: string | null;
            sender_name: string | null;
          };
          if (seenIds.current.has(row.id)) return;
          if (row.sender_id === currentUserId) return; // my own echo
          seenIds.current.add(row.id);
          setMessages((m) => {
            // Backstop: skip an assistant row identical to the answer
            // I just streamed (its id may not be in seenIds yet).
            if (row.role === "assistant") {
              const last = m[m.length - 1];
              if (
                last &&
                last.role === "assistant" &&
                last.content === row.content
              ) {
                return m;
              }
            }
            return [
              ...m,
              {
                id: row.id,
                role: row.role,
                content: row.content,
                sources: Array.isArray(row.sources)
                  ? (row.sources as Source[])
                  : [],
                mine: false,
                senderName: row.sender_name ?? undefined,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mode, sharedThreadId, currentUserId]);

  function updateLast(fn: (msg: ChatMessage) => ChatMessage) {
    setMessages((m) => {
      if (m.length === 0) return m;
      const copy = [...m];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });
  }

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: q, mine: true }]);
    setSending(true);

    try {
      const res = await fetch(`/api/rooms/${roomId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, mode }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "오류가 발생했습니다.");
        return;
      }

      setMessages((m) => [
        ...m,
        { role: "assistant", content: "", sources: [], mine: false },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: {
            type: string;
            text?: string;
            sources?: Source[];
            error?: string;
            id?: string | null;
          };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }

          if (evt.type === "user_id" || evt.type === "done") {
            if (evt.id) seenIds.current.add(evt.id);
          } else if (evt.type === "sources") {
            updateLast((msg) => ({ ...msg, sources: evt.sources ?? [] }));
          } else if (evt.type === "delta") {
            updateLast((msg) => ({
              ...msg,
              content: msg.content + (evt.text ?? ""),
            }));
          } else if (evt.type === "error") {
            setError(evt.error ?? "생성 중 오류가 발생했습니다.");
            setMessages((m) =>
              m.length &&
              m[m.length - 1].role === "assistant" &&
              !m[m.length - 1].content
                ? m.slice(0, -1)
                : m,
            );
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-black bg-white">
      <div className="max-h-[460px] min-h-[220px] space-y-5 overflow-y-auto p-5">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-black/40">
            {hasDocuments
              ? mode === "shared"
                ? "방 멤버 모두가 함께 보는 공용 채팅입니다."
                : "문서에 대해 무엇이든 물어보세요."
              : "먼저 PDF를 업로드하면 문서 기반으로 답변할 수 있습니다."}
          </p>
        )}

        {messages.map((m, i) => {
          const isRight = m.mine ?? m.role === "user";
          const isStreaming = m.role === "assistant" && m.content === "";
          const label =
            m.role === "assistant"
              ? "d.ground"
              : isRight
                ? "나"
                : (m.senderName ?? "멤버");
          return (
            <div
              key={i}
              className={`flex flex-col ${
                isRight ? "items-end" : "items-start"
              }`}
            >
              <p className="oma-label mb-1 text-black/35">{label}</p>
              <div
                className={`max-w-[85%] border border-black bg-white px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "assistant"
                    ? "border-l-2 border-l-[var(--color-accent)]"
                    : ""
                }`}
              >
                {isStreaming ? (
                  <p className="text-black/40">
                    문서를 검색하고 답변을 생성하는 중…
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
                {m.role === "assistant" &&
                  (() => {
                    const all = dedupeSources(m.sources);
                    if (all.length === 0) return null;
                    const shown = all.slice(0, MAX_SOURCES);
                    const rest = all.length - shown.length;
                    return (
                      <p className="mt-2 font-mono text-xs text-black/40">
                        출처: {shown.join(" · ")}
                        {rest > 0 && ` 외 ${rest}건`}
                      </p>
                    );
                  })()}
              </div>
            </div>
          );
        })}

        {error && (
          <p className="font-mono text-xs text-[var(--color-accent)]">
            ✗ {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-stretch border-t border-black">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
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
