"use client";

import { Message as MessageType } from "@/hooks/useSocket";
import { formatDistanceToNow } from "date-fns";

interface MessageProps {
  message: MessageType;
  isOwn: boolean;
}

export default function Message({ message, isOwn }: MessageProps) {
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
