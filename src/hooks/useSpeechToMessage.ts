"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// Web Speech API (not in all TS libs) - minimal typing
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): { transcript: string };
  [index: number]: { transcript: string };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start(): void;
      stop(): void;
      onresult:
        | ((event: {
            resultIndex: number;
            results: SpeechRecognitionResultList;
          }) => void)
        | null;
      onerror: ((event: { error: string }) => void) | null;
      onstart?: (() => void) | null;
      onend?: (() => void) | null;
    };
    webkitSpeechRecognition?: Window["SpeechRecognition"];
  }
}

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

const MIN_TRANSCRIPT_LENGTH = 2;

export interface UseSpeechToMessageOptions {
  /** When true, recognition runs (listening). Send is still gated by parent via onFinalTranscript. */
  enabled: boolean;
  roomId: string;
  username: string;
  /** Called when the browser reports a "final" result (user paused). Parent should send only if it's their turn. */
  onFinalTranscript: (text: string) => void;
}

/**
 * When in a voice call, uses the browser's Speech Recognition to listen.
 * The browser decides "finished talking" when you pause (it returns a "final" result).
 * We call onFinalTranscript(text); the parent sends to chat only when it's the user's turn.
 */
export function useSpeechToMessage(options: UseSpeechToMessageOptions) {
  const { enabled, roomId, username, onFinalTranscript } = options;

  const recognitionRef = useRef<{
    start(): void;
    stop(): void;
  } | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const startRecognition = useCallback(() => {
    if (!SpeechRecognitionAPI || !enabled || !roomId || !username) return;
    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "es-ES";
      recognition.onresult = (event: {
        resultIndex: number;
        results: SpeechRecognitionResultList;
      }) => {
        let finalTranscript = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) {
            finalTranscript += text;
          } else {
            interim += text;
          }
        }
        if (interim) setInterimTranscript(interim);
        if (finalTranscript.trim().length >= MIN_TRANSCRIPT_LENGTH) {
          setInterimTranscript("");
          onFinalRef.current(finalTranscript.trim());
        }
      };
      recognition.onerror = (event: { error: string }) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("Speech recognition error:", event.error);
        }
      };
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        const willRestart =
          enabledRef.current && recognitionRef.current === recognition;
        // Don't flash: keep isListening true when we'll restart
        if (!willRestart) setIsListening(false);
        if (!willRestart) setInterimTranscript("");
        // Browser often stops after one utterance; restart so we keep listening.
        if (willRestart) {
          setTimeout(() => {
            if (!enabledRef.current || recognitionRef.current !== recognition)
              return;
            try {
              recognition.start();
            } catch (_) {
              setIsListening(false);
              setInterimTranscript("");
            }
          }, 250);
        }
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Speech recognition not available:", e);
    }
  }, [enabled, roomId, username]);

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      setInterimTranscript("");
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (enabled) {
      startRecognition();
    } else {
      stopRecognition();
    }
    return () => stopRecognition();
  }, [enabled, startRecognition, stopRecognition]);

  return {
    isSupported: !!SpeechRecognitionAPI,
    isListening,
    interimTranscript,
  };
}
