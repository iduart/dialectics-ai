"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import UserLandingPage from "@/components/UserLandingPage";
import Chat from "@/components/Chat";
import { DebateConfig } from "@/types";

function HomeContent() {
  const [roomId, setRoomId] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [debateConfig, setDebateConfig] = useState<DebateConfig | null>(null);
  const [initialArgument, setInitialArgument] = useState<string | undefined>();
  const [isInChat, setIsInChat] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if there's a room parameter in the URL
    const roomParam = searchParams.get("room");
    if (roomParam) {
      setRoomId(roomParam);
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
