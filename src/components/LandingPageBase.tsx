"use client";

import { ReactNode, useState } from "react";
import { DebateConfig } from "@/types";

interface LandingPageBaseProps {
  onJoinRoom: (
    roomId: string,
    username: string,
    debateConfig: DebateConfig | undefined
  ) => void;
  createContent: (username: string) => ReactNode;
}

export default function LandingPageBase({
  onJoinRoom,
  createContent,
}: LandingPageBaseProps) {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");

  const handleJoinRoom = () => {
    if (username.trim() && roomId.trim()) {
      onJoinRoom(roomId, username, undefined);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-slate-100 mb-2">
            Team Chat
          </h1>
          <p className="text-gray-600 dark:text-slate-400">
            Connect with your team in real-time
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg mb-6">
          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "create"
                ? "bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100 shadow-sm"
                : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-300"
            }`}
          >
            Create Room
          </button>
          <button
            onClick={() => setActiveTab("join")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "join"
                ? "bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100 shadow-sm"
                : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-300"
            }`}
          >
            Join Room
          </button>
        </div>

        <div className="space-y-6">
          {/* Username Input - Always visible */}
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
            >
              Your Name
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
              maxLength={20}
            />
          </div>

          {/* Tab Content */}
          {activeTab === "create" ? (
            createContent(username)
          ) : (
            <>
              {/* Room ID Input */}
              <div>
                <label
                  htmlFor="roomId"
                  className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
                >
                  Room ID
                </label>
                <input
                  type="text"
                  id="roomId"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room ID or paste link"
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
                />
              </div>

              {/* Join Room Button */}
              <button
                onClick={handleJoinRoom}
                disabled={!username.trim() || !roomId.trim()}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-slate-600 text-white py-3 rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
              >
                Join Room
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-center space-x-4 text-xs text-gray-500 dark:text-slate-400">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Real-time messaging</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span>Shareable links</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
