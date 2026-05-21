"use client";

import { useState } from "react";
import { restoreRoom, purgeRoomsNow } from "@/app/actions";

interface DeletedRoom {
  id: string;
  name: string;
  deleted_at: string;
}

function daysLeft(deletedAt: string): number {
  return Math.max(
    0,
    30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000),
  );
}

export default function DeletedRoomsPanel({
  rooms,
}: {
  rooms: DeletedRoom[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (rooms.length === 0) return null;

  const allSelected = selected.size === rooms.length;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rooms.map((r) => r.id)));
  }

  return (
    <div className="mt-12">
      <div className="flex items-end justify-between">
        <p className="oma-label text-black/40">
          삭제 예정 <span className="text-black/25">{rooms.length}</span>
        </p>
        {selected.size > 0 && (
          <form action={purgeRoomsNow}>
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="room_id" value={id} />
            ))}
            <button
              type="submit"
              onClick={(e) => {
                if (
                  !confirm(
                    `선택한 ${selected.size}개 방을 지금 영구 삭제합니다. 문서·대화·임베딩이 모두 사라지고 복구할 수 없습니다. 계속할까요?`,
                  )
                )
                  e.preventDefault();
              }}
              className="oma-label text-[var(--color-accent)] transition-opacity hover:opacity-70"
            >
              선택 {selected.size}개 영구삭제
            </button>
          </form>
        )}
      </div>

      <div className="mt-3 border-y border-black/10">
        <label className="flex cursor-pointer items-center gap-2.5 border-b border-black/10 py-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-3.5 w-3.5 accent-black"
          />
          <span className="oma-label text-black/35">전체 선택</span>
        </label>

        <ul>
          {rooms.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between border-b border-black/10 py-3 last:border-b-0"
            >
              <label className="flex min-w-0 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  className="h-3.5 w-3.5 shrink-0 accent-black"
                />
                <span className="min-w-0">
                  <span className="text-sm text-black/55 line-through">
                    {r.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-black/35">
                    {daysLeft(r.deleted_at)}일 후 자동 영구 삭제
                  </span>
                </span>
              </label>
              <form action={restoreRoom}>
                <input type="hidden" name="room_id" value={r.id} />
                <button
                  type="submit"
                  className="oma-label shrink-0 text-black/40 transition-colors hover:text-black"
                >
                  복구
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
