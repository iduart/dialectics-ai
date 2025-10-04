"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

interface LandingPageProps {
  onJoinRoom: (
    roomId: string,
    username: string,
    debateConfig: DebateConfig
  ) => void;
}

interface DebateConfig {
  description: string;
  toleranceLevel: string;
  duration: string;
}

export default function LandingPage({ onJoinRoom }: LandingPageProps) {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [debateDescription, setDebateDescription] = useState("");
  const [toleranceLevel, setToleranceLevel] = useState("1");
  const [duration, setDuration] = useState("30");

  const handleCreateRoom = () => {
    if (username.trim()) {
      const newRoomId = uuidv4();
      setRoomId(newRoomId);
      setIsCreatingRoom(true);
    }
  };

  const handleJoinRoom = () => {
    if (username.trim() && roomId.trim()) {
      const debateConfig: DebateConfig = {
        description: debateDescription,
        toleranceLevel: toleranceLevel,
        duration: duration,
      };
      onJoinRoom(roomId, username, debateConfig);
    }
  };

  const handleJoinExistingRoom = () => {
    setIsCreatingRoom(false);
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

        <div className="space-y-6">
          {/* Username Input */}
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

          {/* Debate Description */}
          <div>
            <label
              htmlFor="debateDescription"
              className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
            >
              Debate Topic / Context
            </label>
            <textarea
              id="debateDescription"
              value={debateDescription}
              onChange={(e) => setDebateDescription(e.target.value)}
              placeholder="Describe the topic or provide context for the debate..."
              rows={3}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-none"
              maxLength={500}
            />
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {debateDescription.length}/500 characters
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
                Nivel 2 (Intermedio) - Se permiten adjetivos críticos, pero no
                ofensivas directas
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

          {!isCreatingRoom ? (
            /* Room ID Input */
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
              <button
                onClick={handleJoinRoom}
                disabled={
                  !username.trim() ||
                  !roomId.trim() ||
                  !debateDescription.trim()
                }
                className="w-full mt-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-3 rounded-lg font-medium transition-colors"
              >
                Join Room
              </button>
            </div>
          ) : (
            /* Room Created */
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-green-800 mb-2">
                Room Created!
              </h3>
              <p className="text-sm text-green-700 mb-3">
                Share this link with your team:
              </p>
              <div className="bg-white border border-green-200 rounded p-2 mb-3">
                <code className="text-xs text-gray-800 break-all">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}?room=${roomId}`
                    : roomId}
                </code>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={copyRoomLink}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
                >
                  Copy Link
                </button>
                <button
                  onClick={handleJoinRoom}
                  disabled={!username.trim() || !debateDescription.trim()}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
                >
                  Enter Room
                </button>
              </div>
            </div>
          )}

          {!isCreatingRoom && (
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">
                Don&apos;t have a room?
              </p>
              <button
                onClick={handleCreateRoom}
                disabled={!username.trim() || !debateDescription.trim()}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white py-3 px-6 rounded-lg font-medium transition-colors"
              >
                Create New Room
              </button>
            </div>
          )}

          {isCreatingRoom && (
            <div className="text-center">
              <button
                onClick={handleJoinExistingRoom}
                className="text-blue-500 hover:text-blue-600 text-sm font-medium transition-colors"
              >
                Join existing room instead
              </button>
            </div>
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
