"use client";

import { Message as MessageType } from "@/hooks/useSocket";
import { formatDistanceToNow } from "date-fns";

interface MessageProps {
  message: MessageType;
  isOwn: boolean;
}

export default function Message({ message, isOwn }: MessageProps) {
  const isAIModerator = message.isAIModerator;

  if (isAIModerator) {
    return (
      <div className="flex justify-center mb-4">
        <div className="max-w-md px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 shadow-sm">
          <div className="flex items-center mb-2">
            <div className="w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center mr-2">
              <span className="text-amber-800 text-xs font-bold">AI</span>
            </div>
            <div className="text-xs font-semibold text-amber-800">
              {message.username}
            </div>
          </div>
          <div className="text-sm text-amber-900 mb-1">{message.message}</div>
          {message.reason && (
            <div className="text-xs text-amber-700 italic">
              Reason: {message.reason}
            </div>
          )}
          <div className="text-xs text-amber-600 mt-2">
            {formatDistanceToNow(new Date(message.timestamp), {
              addSuffix: true,
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isOwn
            ? "bg-blue-500 text-white rounded-br-none"
            : "bg-gray-200 text-gray-800 rounded-bl-none"
        }`}
      >
        {!isOwn && (
          <div className="text-xs font-semibold text-gray-600 mb-1">
            {message.username}
          </div>
        )}
        <div className="text-sm">{message.message}</div>
        <div
          className={`text-xs mt-1 ${
            isOwn ? "text-blue-100" : "text-gray-500"
          }`}
        >
          {formatDistanceToNow(new Date(message.timestamp), {
            addSuffix: true,
          })}
        </div>
      </div>
    </div>
  );
}
