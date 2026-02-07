"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { DebateConfig } from "@/types";
import LandingPageBase from "./LandingPageBase";

interface UserLandingPageProps {
  onJoinRoom: (
    roomId: string,
    username: string,
    debateConfig: DebateConfig | undefined,
    initialArgument?: string
  ) => void;
}

export default function UserLandingPage({ onJoinRoom }: UserLandingPageProps) {
  const [topic, setTopic] = useState("");
  const [moderationLevel, setModerationLevel] = useState("1");
  const [duration, setDuration] = useState("30");

  const getModerationLevelText = (level: string) => {
    switch (level) {
      case "1":
        return "Tranquilo";
      case "2":
        return "Intermedio";
      case "3":
        return "Intenso";
      default:
        return "Tranquilo";
    }
  };

  const handleCreateRoom = (username: string, initialArgument?: string) => {
    if (username.trim()) {
      const newRoomId = uuidv4();
      const debateConfig: DebateConfig = {
        description: topic.trim() || "General Discussion",
        toleranceLevel: moderationLevel,
        duration,
      };
      onJoinRoom(newRoomId, username, debateConfig, initialArgument);
    }
  };

  const createContent = (
    username: string,
    initialArgument: string,
    setInitialArgument: (value: string) => void
  ) => (
    <>
      {/* Topic Input - first */}
      <div>
        <label
          htmlFor="topic"
          className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
        >
          Topic <span className="text-gray-400 text-xs">(Optional)</span>
        </label>
        <input
          type="text"
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter discussion topic (optional)"
          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
        />
      </div>

      {/* Postura ante el debate - after Topic */}
      <div>
        <label
          htmlFor="initialArgument"
          className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
        >
          Postura ante el debate
        </label>
        <textarea
          id="initialArgument"
          value={initialArgument}
          onChange={(e) => setInitialArgument(e.target.value)}
          placeholder="Tu argumento o postura inicial en el debate (opcional)"
          rows={4}
          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-y text-sm"
        />
      </div>

      {/* Moderation Level Dropdown */}
      <div>
        <label
          htmlFor="moderationLevel"
          className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
        >
          Moderation Level
        </label>
        <select
          id="moderationLevel"
          value={moderationLevel}
          onChange={(e) => setModerationLevel(e.target.value)}
          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
        >
          <option value="1">Tranquilo</option>
          <option value="2">Intermedio</option>
          <option value="3">Intenso</option>
        </select>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
          Current selection: {getModerationLevelText(moderationLevel)}
        </p>
      </div>

      {/* Duration */}
      <div>
        <label
          htmlFor="duration"
          className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
        >
          Duración del debate
        </label>
        <select
          id="duration"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
        >
          <option value="6">6 minutos</option>
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
          <option value="45">45 minutos</option>
          <option value="0">Sin límite</option>
        </select>
      </div>

      {/* Create Room Button */}
      <button
        onClick={() => handleCreateRoom(username, initialArgument)}
        disabled={!username.trim()}
        className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 dark:disabled:bg-slate-600 text-white py-3 rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
      >
        Create New Room
      </button>
    </>
  );

  return (
    <LandingPageBase onJoinRoom={onJoinRoom} createContent={createContent} />
  );
}
