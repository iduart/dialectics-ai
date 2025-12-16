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
  const [promptInsultos, setPromptInsultos] = useState("");
  const [promptFactCheck, setPromptFactCheck] = useState("");
  const [promptDesvioTema, setPromptDesvioTema] = useState("");
  const [mocionPrompt, setMocionPrompt] = useState("");

  const handleCreateRoom = (username: string) => {
    if (username.trim()) {
      const newRoomId = uuidv4();
      const debateConfig: DebateConfig = {
        description: "Custom debate room",
        toleranceLevel: toleranceLevel,
        duration: "30",
        promptInsultos: promptInsultos.trim() || undefined,
        promptFactCheck: promptFactCheck.trim() || undefined,
        promptDesvioTema: promptDesvioTema.trim() || undefined,
        mocionPrompt: mocionPrompt.trim() || undefined,
      };
      onJoinRoom(newRoomId, username, debateConfig);
    }
  };

  const createContent = (username: string) => (
    <>
      {/* AI Analysis Prompts */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
          AI Analysis Prompts (Optional)
        </label>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
          Customize prompts for AI analysis. Each message will be evaluated
          against all prompts. Leave blank to use default values.
        </p>

        {/* Prompt de Insultos */}
        <div className="mb-4">
          <label
            htmlFor="prompt-insultos"
            className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-2"
          >
            Prompt de Insultos
          </label>
          <textarea
            id="prompt-insultos"
            value={promptInsultos}
            onChange={(e) => setPromptInsultos(e.target.value)}
            placeholder="Enter custom prompt for insults detection (optional)..."
            rows={6}
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-y text-sm"
          />
        </div>

        {/* Prompt de Fact Check */}
        <div className="mb-4">
          <label
            htmlFor="prompt-fact-check"
            className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-2"
          >
            Prompt de Fact Check
          </label>
          <textarea
            id="prompt-fact-check"
            value={promptFactCheck}
            onChange={(e) => setPromptFactCheck(e.target.value)}
            placeholder="Enter custom prompt for fact checking (optional)..."
            rows={6}
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-y text-sm"
          />
        </div>

        {/* Prompt de Desvío de Tema */}
        <div className="mb-4">
          <label
            htmlFor="prompt-desvio-tema"
            className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-2"
          >
            Prompt de Desvío de Tema
          </label>
          <textarea
            id="prompt-desvio-tema"
            value={promptDesvioTema}
            onChange={(e) => setPromptDesvioTema(e.target.value)}
            placeholder="Enter custom prompt for topic deviation detection (optional)..."
            rows={6}
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-y text-sm"
          />
        </div>
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
