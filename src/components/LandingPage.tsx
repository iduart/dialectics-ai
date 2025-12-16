"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { DebateConfig } from "@/types";
import LandingPageBase from "./LandingPageBase";

interface LandingPageProps {
  onJoinRoom: (
    roomId: string,
    username: string,
    debateConfig: DebateConfig | undefined
  ) => void;
}

export default function LandingPage({ onJoinRoom }: LandingPageProps) {
  const [toleranceLevel] = useState("1");
  const [prompts, setPrompts] = useState<string[]>(["", "", "", "", "", ""]);
  const [mocionPrompt, setMocionPrompt] = useState("");

  const handlePromptChange = (index: number, value: string) => {
    const newPrompts = [...prompts];
    newPrompts[index] = value;
    setPrompts(newPrompts);
  };

  const handleCreateRoom = (username: string) => {
    if (username.trim()) {
      const newRoomId = uuidv4();
      const debateConfig: DebateConfig = {
        description: "Custom debate room",
        toleranceLevel: toleranceLevel,
        duration: "30",
        prompts: prompts.filter((prompt) => prompt.trim() !== ""),
        mocionPrompt: mocionPrompt.trim() || undefined,
      };
      onJoinRoom(newRoomId, username, debateConfig);
    }
  };

  const createContent = (username: string) => (
    <>
      {/* Multiple AI Prompts */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
          AI Analysis Prompts (Optional)
        </label>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
          Add up to 6 custom prompts for AI analysis. Each message will be
          evaluated against all provided prompts.
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
              onChange={(e) => handlePromptChange(index, e.target.value)}
              placeholder={`Enter prompt ${index + 1} for AI analysis...`}
              rows={6}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-y text-sm"
            />
          </div>
        ))}
      </div>

      {/* Mocion Prompt */}
      <div>
        <label
          htmlFor="mocion-prompt"
          className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
        >
          Mocion Prompt
        </label>
        <textarea
          id="mocion-prompt"
          value={mocionPrompt}
          onChange={(e) => setMocionPrompt(e.target.value)}
          placeholder="Enter mocion prompt..."
          rows={6}
          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-y text-sm"
        />
      </div>

      {/* Create Room Button */}
      <button
        onClick={() => handleCreateRoom(username)}
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
