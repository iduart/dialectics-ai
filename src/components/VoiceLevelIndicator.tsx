"use client";

import { useEffect, useRef, useState } from "react";

interface VoiceLevelIndicatorProps {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}

/**
 * Shows a live microphone level so users can see that their voice is being captured.
 */
export default function VoiceLevelIndicator({
  stream,
  muted,
  className = "",
}: VoiceLevelIndicatorProps) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    const tick = () => {
      if (!analyserRef.current || !dataArray) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      const normalized = Math.min(100, Math.round((avg / 128) * 100));
      setLevel(muted ? 0 : normalized);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audioContext.close();
      analyserRef.current = null;
      audioContextRef.current = null;
      dataArrayRef.current = null;
      setLevel(0);
    };
  }, [stream, muted]);

  const displayLevel = stream && !muted ? level : 0;

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      title={stream ? (muted ? "Muted" : "Microphone level") : "No microphone"}
      aria-hidden
    >
      <div className="flex gap-0.5 items-end h-5">
        {[0, 1, 2, 3, 4].map((i) => {
          const threshold = (i + 1) * 20;
          const on = displayLevel >= threshold;
          return (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-75 ${
                on
                  ? "bg-emerald-500 dark:bg-emerald-400"
                  : "bg-gray-300 dark:bg-slate-600"
              }`}
              style={{ height: `${(i + 1) * 4}px` }}
            />
          );
        })}
      </div>
    </div>
  );
}
