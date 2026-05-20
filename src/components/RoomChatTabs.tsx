"use client";

import { useState } from "react";
import RoomChat, { type ChatMessage } from "./RoomChat";

/**
 * Two-tab chat: the user's private 1:1 thread and the room-wide
 * shared thread. Both RoomChat instances stay mounted so each tab
 * keeps its live conversation state when you switch.
 */
export default function RoomChatTabs({
  roomId,
  hasDocuments,
  currentUserId,
  sharedThreadId,
  privateMessages,
  sharedMessages,
}: {
  roomId: string;
  hasDocuments: boolean;
  currentUserId: string;
  sharedThreadId?: string;
  privateMessages: ChatMessage[];
  sharedMessages: ChatMessage[];
}) {
  const [tab, setTab] = useState<"private" | "shared">("private");

  const tabs = [
    { key: "private" as const, label: "내 채팅" },
    { key: "shared" as const, label: "공용 스레드" },
  ];

  return (
    <div>
      <div className="flex border border-b-0 border-black">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              tab === t.key
                ? "bg-black text-white"
                : "bg-white text-black/45 hover:text-black"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={tab === "private" ? "" : "hidden"}>
        <RoomChat
          roomId={roomId}
          mode="private"
          initialMessages={privateMessages}
          hasDocuments={hasDocuments}
          currentUserId={currentUserId}
        />
      </div>
      <div className={tab === "shared" ? "" : "hidden"}>
        <RoomChat
          roomId={roomId}
          mode="shared"
          initialMessages={sharedMessages}
          hasDocuments={hasDocuments}
          currentUserId={currentUserId}
          sharedThreadId={sharedThreadId}
        />
      </div>
    </div>
  );
}
