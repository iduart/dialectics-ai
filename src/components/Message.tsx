"use client";

import { Message as MessageType } from "@/hooks/useSocket";
import { formatDistanceToNow } from "date-fns";

interface MessageProps {
  message: MessageType;
  isOwn: boolean;
  onMocionClick?: (message: MessageType) => void;
}

export default function Message({
  message,
  isOwn,
  onMocionClick,
}: MessageProps) {
  const isAIModerator = message.isAIModerator;

  // Debug: Log the alignment info
  console.log(
    `Message from ${message.username}: isOwn=${isOwn}, socketId=${message.socketId}`
  );

  if (isAIModerator) {
    return (
      <div className="flex justify-center mb-4 px-2">
        <div className="max-w-md px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 shadow-sm">
          <div className="flex items-center mb-2">
            <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mr-3 shadow-sm">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {message.username}
            </div>
          </div>
          <div className="text-sm text-amber-900 dark:text-amber-100 mb-2 leading-relaxed">
            {message.message}
          </div>
          {message.reason && (
            <div className="text-xs text-amber-700 dark:text-amber-300 italic bg-amber-100 dark:bg-amber-800/30 px-2 py-1 rounded-lg">
              <span className="font-medium">Reason:</span> {message.reason}
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-amber-600 dark:text-amber-400">
              {formatDistanceToNow(new Date(message.timestamp), {
                addSuffix: true,
              })}
            </div>
            {onMocionClick && message.promptName === "Desvío de Tema" && (
              <button
                onClick={() => onMocionClick(message)}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
              >
                Mocion
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-3 px-2`}
    >
      <div className="max-w-xs lg:max-w-md">
        {/* Message bubble */}
        <div className="relative">
          <div
            className={`px-4 py-2 rounded-2xl shadow-sm ${
              isOwn
                ? "bg-blue-500 text-white dark:bg-blue-600 ml-auto border-2 border-red-500"
                : "bg-white text-gray-800 border border-gray-200 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 mr-auto"
            }`}
          >
            {!isOwn ? (
              <div className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">
                {message.username}
              </div>
            ) : (
              <div className="text-xs font-semibold text-blue-100 dark:text-blue-200 mb-1">
                You
              </div>
            )}
            <div className="text-sm leading-relaxed">{message.message}</div>
          </div>

          {/* Timestamp */}
          <div
            className={`text-xs mt-1 px-1 ${
              isOwn
                ? "text-gray-500 dark:text-slate-400 text-right"
                : "text-gray-500 dark:text-slate-400 text-left"
            }`}
          >
            {formatDistanceToNow(new Date(message.timestamp), {
              addSuffix: true,
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
