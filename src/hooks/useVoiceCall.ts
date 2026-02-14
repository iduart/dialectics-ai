"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const STUN_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export type VoiceCallState =
  | "idle"
  | "joining"
  | "waiting"
  | "connected"
  | "error";

export interface UseVoiceCallOptions {
  roomId: string;
  socketId: string | null;
  joinVoice: (roomId: string) => void;
  leaveVoice: (roomId: string) => void;
  sendVoiceOffer: (
    targetSocketId: string,
    sdp: RTCSessionDescriptionInit
  ) => void;
  sendVoiceAnswer: (
    targetSocketId: string,
    sdp: RTCSessionDescriptionInit
  ) => void;
  sendVoiceIceCandidate: (
    targetSocketId: string,
    candidate: RTCIceCandidateInit
  ) => void;
  onVoiceParticipantJoined: (
    cb: (data: { socketId: string; username: string | null }) => void
  ) => () => void;
  onVoiceParticipantLeft: (
    cb: (data: { socketId: string }) => void
  ) => () => void;
  onVoiceParticipants: (
    cb: (data: {
      participants: Array<{ socketId: string; username: string | null }>;
    }) => void
  ) => () => void;
  onVoiceOffer: (
    cb: (data: { fromSocketId: string; sdp: RTCSessionDescriptionInit }) => void
  ) => () => void;
  onVoiceAnswer: (
    cb: (data: { fromSocketId: string; sdp: RTCSessionDescriptionInit }) => void
  ) => () => void;
  onVoiceIce: (
    cb: (data: { fromSocketId: string; candidate: RTCIceCandidateInit }) => void
  ) => () => void;
}

export function useVoiceCall(options: UseVoiceCallOptions) {
  const {
    roomId,
    socketId,
    joinVoice,
    leaveVoice,
    sendVoiceOffer,
    sendVoiceAnswer,
    sendVoiceIceCandidate,
    onVoiceParticipantJoined,
    onVoiceParticipantLeft,
    onVoiceParticipants,
    onVoiceOffer,
    onVoiceAnswer,
    onVoiceIce,
  } = options;

  const [state, setState] = useState<VoiceCallState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteSocketIdRef = useRef<string | null>(null);

  const closePeerConnection = useCallback(() => {
    const pc = pcRef.current;
    if (pc) {
      pc.close();
      pcRef.current = null;
    }
    remoteSocketIdRef.current = null;
    setRemoteStream(null);
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const leaveVoiceCall = useCallback(() => {
    closePeerConnection();
    stopLocalStream();
    if (roomId) leaveVoice(roomId);
    setState("idle");
    setError(null);
  }, [roomId, leaveVoice, closePeerConnection, stopLocalStream]);

  const joinVoiceCall = useCallback(async () => {
    if (!socketId || !roomId) return;
    setError(null);
    setState("joining");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      joinVoice(roomId);
      setState("waiting");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not access microphone";
      setError(message);
      setState("error");
    }
  }, [socketId, roomId, joinVoice]);

  const createPeerConnection = useCallback(
    (remoteSocketId: string) => {
      if (pcRef.current && remoteSocketIdRef.current === remoteSocketId)
        return pcRef.current;
      closePeerConnection();
      const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
      pcRef.current = pc;
      remoteSocketIdRef.current = remoteSocketId;

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.ontrack = (ev) => {
        if (ev.streams?.[0]) setRemoteStream(ev.streams[0]);
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate && remoteSocketId) {
          sendVoiceIceCandidate(remoteSocketId, ev.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setState("waiting");
          closePeerConnection();
        } else if (pc.connectionState === "connected") {
          setState("connected");
        }
      };

      return pc;
    },
    [closePeerConnection, sendVoiceIceCandidate]
  );

  useEffect(() => {
    const unjoin = onVoiceParticipantJoined(({ socketId: otherId }) => {
      if (otherId === socketId) return;
      const pc = createPeerConnection(otherId);
      pc.createOffer()
        .then(
          (offer) => pc.setLocalDescription(offer),
          (e) => console.error("createOffer error", e)
        )
        .then(() => {
          const sdp = pc.localDescription;
          if (sdp) sendVoiceOffer(otherId, sdp);
        });
    });

    const unleft = onVoiceParticipantLeft(({ socketId: leftId }) => {
      if (remoteSocketIdRef.current === leftId) {
        closePeerConnection();
        setState("waiting");
      }
    });

    const unparts = onVoiceParticipants(() => {
      // New joiner: do not create offer; the existing peer will send offer on voice-participant-joined.
      // We only need to ensure we're ready to receive it (createPeerConnection is called when we get the offer).
    });

    const unoffer = onVoiceOffer(async ({ fromSocketId, sdp }) => {
      const pc = createPeerConnection(fromSocketId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (pc.localDescription)
          sendVoiceAnswer(fromSocketId, pc.localDescription);
      } catch (e) {
        console.error("handle offer error", e);
      }
    });

    const unanswer = onVoiceAnswer(async ({ fromSocketId, sdp }) => {
      const pc = pcRef.current;
      if (!pc || remoteSocketIdRef.current !== fromSocketId) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (e) {
        console.error("handle answer error", e);
      }
    });

    const unice = onVoiceIce(async ({ fromSocketId, candidate }) => {
      const pc = pcRef.current;
      if (!pc || remoteSocketIdRef.current !== fromSocketId || !candidate)
        return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("addIceCandidate error", e);
      }
    });

    return () => {
      unjoin();
      unleft();
      unparts();
      unoffer();
      unanswer();
      unice();
    };
  }, [
    socketId,
    createPeerConnection,
    sendVoiceOffer,
    sendVoiceAnswer,
    onVoiceParticipantJoined,
    onVoiceParticipantLeft,
    onVoiceParticipants,
    onVoiceOffer,
    onVoiceAnswer,
    onVoiceIce,
    closePeerConnection,
  ]);

  const setMuted = useCallback((muted: boolean) => {
    setIsMuted(muted);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, []);

  return {
    state,
    isMuted,
    setMuted,
    remoteStream,
    localStream,
    localStreamRef,
    error,
    joinVoiceCall,
    leaveVoiceCall,
  };
}
