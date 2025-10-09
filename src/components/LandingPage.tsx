"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

interface LandingPageProps {
  onJoinRoom: (
    roomId: string,
    username: string,
    debateConfig: DebateConfig | undefined,
    isCreating: boolean
  ) => void;
}

interface DebateConfig {
  description: string;
  customSystemPrompt: string;
  toleranceLevel: string;
  duration: string;
}

export default function LandingPage({ onJoinRoom }: LandingPageProps) {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [debateDescription, setDebateDescription] = useState("");
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [toleranceLevel, setToleranceLevel] = useState("1");
  const [duration, setDuration] = useState("30");

  const handleCreateRoom = () => {
    if (username.trim() && customSystemPrompt.trim()) {
      const newRoomId = uuidv4();
      const debateConfig: DebateConfig = {
        description: debateDescription,
        customSystemPrompt: customSystemPrompt.trim(),
        toleranceLevel: toleranceLevel,
        duration: duration,
      };
      onJoinRoom(newRoomId, username, debateConfig, true);
    }
  };

  const handleJoinRoom = () => {
    if (username.trim() && roomId.trim()) {
      onJoinRoom(roomId, username, undefined, false);
    }
  };

  const handleJoinExistingRoom = () => {
    setActiveTab("join");
    setRoomId("");
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    alert("Room link copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-8 w-full max-w-md">
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
            <>
              {/* Debate Description - DISABLED */}
              <div>
                <label
                  htmlFor="debateDescription"
                  className="block text-sm font-medium text-gray-400 dark:text-slate-500 mb-2"
                >
                  Debate Topic / Context (Disabled for testing)
                </label>
                <textarea
                  id="debateDescription"
                  value={debateDescription}
                  onChange={(e) => setDebateDescription(e.target.value)}
                  placeholder="Describe the topic or provide context for the debate..."
                  rows={3}
                  disabled
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-500 placeholder-gray-400 dark:placeholder-slate-600 cursor-not-allowed resize-none"
                />
              </div>

              {/* Custom System Prompt - REQUIRED */}
              <div>
                <label
                  htmlFor="customSystemPrompt"
                  className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
                >
                  Custom System Prompt <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="customSystemPrompt"
                  value={customSystemPrompt}
                  onChange={(e) => setCustomSystemPrompt(e.target.value)}
                  placeholder="Enter your custom system prompt (required)..."
                  rows={6}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-none text-sm"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Define the AI behavior and rules for your debate session.
                </p>
              </div>

              {/* Tolerance Level */}
              <div>
                <label
                  htmlFor="toleranceLevel"
                  className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
                >
                  Tolerance Level
                </label>
                <select
                  id="toleranceLevel"
                  value={toleranceLevel}
                  onChange={(e) => setToleranceLevel(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
                >
                  <option value="1">
                    Nivel 1 (Tranquilo) - Se penalizan adjetivos fuertes y
                    comentarios despectivos
                  </option>
                  <option value="2">
                    Nivel 2 (Intermedio) - Se permiten adjetivos críticos, pero
                    no ofensivas directas
                  </option>
                  <option value="3">
                    Nivel 3 (Intenso) - Se aceptan expresiones más duras, nunca
                    insultos directos
                  </option>
                </select>
              </div>

              {/* Duration */}
              <div>
                <label
                  htmlFor="duration"
                  className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
                >
                  Discussion Duration
                </label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                </select>
              </div>

              {/* Create Room Button */}
              <button
                onClick={handleCreateRoom}
                disabled={!username.trim() || !customSystemPrompt.trim()}
                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 dark:disabled:bg-slate-600 text-white py-3 rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
              >
                Create New Room
              </button>
            </>
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
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-3 rounded-lg font-medium transition-colors"
              >
                Join Room
              </button>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center space-x-4 text-xs text-gray-500">
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
