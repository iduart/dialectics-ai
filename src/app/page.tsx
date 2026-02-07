"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import UserLandingPage from "@/components/UserLandingPage";
import Chat from "@/components/Chat";
import { DebateConfig } from "@/types";

const STORAGE_KEY_PREFIX = "chat_room_";

function HomeContent() {
  const [roomId, setRoomId] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [debateConfig, setDebateConfig] = useState<DebateConfig | null>(null);
  const [initialArgument, setInitialArgument] = useState<string | undefined>();
  const [isInChat, setIsInChat] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Restore chat from URL + sessionStorage on load/refresh
  useEffect(() => {
    const roomParam = searchParams.get("room");
    if (!roomParam) return;
    setRoomId(roomParam);
    try {
      const stored =
        typeof window !== "undefined"
          ? sessionStorage.getItem(STORAGE_KEY_PREFIX + roomParam)
          : null;
      if (stored) {
        const {
          username: u,
          debateConfig: c,
          initialArgument: i,
        } = JSON.parse(stored);
        if (u) {
          setUsername(u);
          setDebateConfig(c || null);
          setInitialArgument(i);
          setIsInChat(true);
        }
      }
    } catch (_) {
      // invalid or missing stored data, keep on landing (with room pre-filled)
    }
  }, [searchParams]);

  const handleJoinRoom = (
    roomId: string,
    username: string,
    debateConfig: DebateConfig | undefined,
    initialArgument?: string
  ) => {
    setRoomId(roomId);
    setUsername(username);
    setDebateConfig(debateConfig || null);
    setInitialArgument(initialArgument);
    setIsInChat(true);
    // Persist room in URL so refresh keeps you in the chat
    const url = `${pathname || "/"}?room=${encodeURIComponent(roomId)}`;
    router.replace(url);
    // Persist session so we can restore on refresh
    try {
      sessionStorage.setItem(
        STORAGE_KEY_PREFIX + roomId,
        JSON.stringify({
          username,
          debateConfig: debateConfig || null,
          initialArgument: initialArgument ?? undefined,
        })
      );
    } catch (_) {}
  };

  if (isInChat) {
    return (
      <Chat
        roomId={roomId}
        username={username}
        debateConfig={debateConfig}
        initialArgument={initialArgument}
      />
    );
  }

  return <UserLandingPage onJoinRoom={handleJoinRoom} />;
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
