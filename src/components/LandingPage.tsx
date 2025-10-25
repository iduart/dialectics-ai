"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { DebateConfig } from "@/types";

interface LandingPageProps {
  onJoinRoom: (
    roomId: string,
    username: string,
    debateConfig: DebateConfig | undefined
  ) => void;
}

export default function LandingPage({ onJoinRoom }: LandingPageProps) {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [toleranceLevel] = useState("1");
  const [prompts, setPrompts] = useState<string[]>(["", "", "", "", "", ""]);

  const handlePromptChange = (index: number, value: string) => {
    const newPrompts = [...prompts];
    newPrompts[index] = value;
    setPrompts(newPrompts);
  };

  const handleCreateRoom = () => {
    if (username.trim()) {
      const newRoomId = uuidv4();
      const debateConfig: DebateConfig = {
        description: "Custom debate room",
        toleranceLevel: toleranceLevel,
        duration: "30",
        prompts: prompts.filter((prompt) => prompt.trim() !== ""),
      };
      onJoinRoom(newRoomId, username, debateConfig);
    }
  };

  const handleJoinRoom = () => {
    if (username.trim() && roomId.trim()) {
      onJoinRoom(roomId, username, undefined);
    }
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
              {/* Multiple AI Prompts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
                  AI Analysis Prompts (Optional)
                </label>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                  Add up to 6 custom prompts for AI analysis. Each message will
                  be evaluated against all provided prompts.
                </p>

                {prompts.map((prompt, index) => (
                  <div key={index} className="mb-4">
                    <label
                      htmlFor={`prompt-${index}`}
                      className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-2"
                    >
                      Prompt {index + 1}
                    </label>
                    <textarea
                      id={`prompt-${index}`}
                      value={prompt}
                      onChange={(e) =>
                        handlePromptChange(index, e.target.value)
                      }
                      placeholder={`Enter prompt ${
                        index + 1
                      } for AI analysis...`}
                      rows={6}
                      className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-y text-sm"
                    />
                  </div>
                ))}
              </div>

              {/* Create Room Button */}
              <button
                onClick={handleCreateRoom}
                disabled={!username.trim()}
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
