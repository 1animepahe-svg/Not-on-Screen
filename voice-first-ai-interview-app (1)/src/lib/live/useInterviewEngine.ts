"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, type LiveServerMessage, type Session } from "@google/genai";
import { MicCapture, MicError, PcmPlayer, pickRecorderMime } from "./audio";
import { transition, type ConnEvent, type ConnState, type Machine } from "./machine";
import type { Persona, SessionDTO, Speaker, TranscriptTurn } from "@/lib/types";

type Toast = (msg: string, tone?: "info" | "warn" | "error" | "success") => void;
type LogEntry = { t: number; state: string; note?: string };

export type EngineOptions = {
  session: SessionDTO;
  personas: Persona[];
  recordAudio: boolean;
  readAloudFallback: boolean;
  handsFreeDefault: boolean;
  toast: Toast;
};

class EngineError extends Error {
  constructor(public kind: "no_key" | "mic" | "network" | "token" | "live", message: string, public fatal = false) {
    super(message);
  }
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new EngineError("live", msg)), ms);
    p.then(
      (v) => (clearTimeout(t), res(v)),
      (e) => (clearTimeout(t), rej(e))
    );
  });
}

export function useInterviewEngine(opts: EngineOptions) {
  const { session, personas, toast } = opts;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // ---------- state ----------
  const [machine, setMachine] = useState<Machine>({ state: "idle", retries: 0 });
  const machineRef = useRef<Machine>(machine);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [caption, setCaption] = useState<{ speaker: Speaker; name: string; text: string } | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [handsFree, setHandsFreeState] = useState(opts.handsFreeDefault);
  const [pttHeld, setPttHeld] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [started, setStarted] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // ---------- refs (hot path, no re-render) ----------
  const t0 = useRef(0);
  const now = () => (t0.current ? Math.round(performance.now() - t0.current) : 0);
  const turnsRef = useRef<TranscriptTurn[]>([]);
  const pending = useRef<TranscriptTurn[]>([]);
  const seq = useRef(0);
  const log = useRef<LogEntry[]>([]);
  const mic = useRef<MicCapture | null>(null);
  const player = useRef<PcmPlayer | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const live = useRef<Session | null>(null);
  const closingByUs = useRef(false);
  const connecting = useRef(false);
  const ending = useRef(false);
  const resumeHandle = useRef<string | null>(null);
  const hadVoiceOpen = useRef(false);
  const handsFreeRef = useRef(handsFree);
  const pttRef = useRef(false);
  const inBuf = useRef<{ text: string; start: number; end: number } | null>(null);
  const outBuf = useRef<{ text: string; start: number; end: number; speaker: Persona } | null>(null);
  const currentIv = useRef<Persona>(personas[0]);
  const timeUpSent = useRef(false);
  const typingStart = useRef<number | null>(null);

  const dispatch = useCallback((e: ConnEvent, note?: string) => {
    const next = transition(machineRef.current, e);
    if (next !== machineRef.current) {
      machineRef.current = next;
      setMachine(next);
      log.current.push({ t: now(), state: next.state, note });
    }
    return next;
  }, []);

  // ---------- transcript logging ----------
  const addTurn = useCallback((t: Omit<TranscriptTurn, "clientId" | "seq">) => {
    const text = t.text.replace(/\s+/g, " ").trim();
    if (!text) return;
    const turn: TranscriptTurn = { ...t, text, clientId: uid(), seq: seq.current++ };
    turnsRef.current = [...turnsRef.current, turn];
    pending.current.push(turn);
    setTurns(turnsRef.current);
  }, []);

  const flush = useCallback(async () => {
    if (!pending.current.length) return true;
    const batch = pending.current.slice();
    try {
      const r = await fetch(`/api/sessions/${session.id}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turns: batch }),
        keepalive: true,
      });
      if (!r.ok) throw new Error(String(r.status));
      const sent = new Set(batch.map((b) => b.clientId));
      pending.current = pending.current.filter((p) => !sent.has(p.clientId));
      return true;
    } catch {
      return false; // stays in the queue; retried on next tick
    }
  }, [session.id]);

  const finalizeCandidate = useCallback(() => {
    const b = inBuf.current;
    if (b && b.text.trim()) addTurn({ speaker: "candidate", speakerName: "You", tsStartMs: b.start, tsEndMs: Math.max(b.end, b.start + 500), text: b.text, channel: "voice" });
    inBuf.current = null;
  }, [addTurn]);

  const finalizeInterviewer = useCallback(
    (suffix = "") => {
      const b = outBuf.current;
      if (b && b.text.trim()) {
        const end = Math.max(b.end, now() + (player.current?.remainingMs() ?? 0));
        addTurn({ speaker: b.speaker.key, speakerName: b.speaker.name, tsStartMs: b.start, tsEndMs: end, text: b.text + suffix, channel: "voice" });
      }
      outBuf.current = null;
      setCaption(null);
    },
    [addTurn]
  );

  // ---------- fallback text interviewer ----------
  const speak = useCallback((text: string) => {
    if (!optsRef.current.readAloudFallback || typeof speechSynthesis === "undefined") return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      speechSynthesis.speak(u);
    } catch {}
  }, []);

  const requestReply = useCallback(
    async (wrapUp = false) => {
      setThinking(true);
      try {
        const r = await fetch("/api/interview/reply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, turns: turnsRef.current, wrapUp }),
        });
        const j = await r.json();
        if (!r.ok || !j.reply) throw new Error(j.error || "reply failed");
        const start = now();
        const p = personas.find((x) => x.key === j.reply.speaker) ?? personas[0];
        currentIv.current = p;
        addTurn({ speaker: p.key, speakerName: p.name, tsStartMs: start, tsEndMs: start + Math.max(1500, j.reply.text.split(/\s+/).length * 380), text: j.reply.text, channel: "text" });
        speak(j.reply.text);
      } catch {
        toast("Couldn't reach the interviewer. Your transcript is safe — press “Ask again”.", "warn");
      } finally {
        setThinking(false);
      }
    },
    [session.id, personas, addTurn, speak, toast]
  );

  const closeLive = useCallback(() => {
    closingByUs.current = true;
    try {
      live.current?.close();
    } catch {}
    live.current = null;
  }, []);

  const goFallback = useCallback(
    (reason: string) => {
      closeLive();
      finalizeCandidate();
      finalizeInterviewer(" —");
      player.current?.interrupt();
      dispatch({ type: "FALLBACK" }, reason);
      setLastError(reason);
      toast("Switched to text mode — the interview continues and your transcript is safe.", "info");
      void fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mode", mode: "fallback_text", log: [{ t: now(), state: "fallback", note: reason }] }),
      }).catch(() => {});
      const last = turnsRef.current.filter((t) => t.speaker !== "system").at(-1);
      if (!last || last.speaker === "candidate") void requestReply();
    },
    [closeLive, finalizeCandidate, finalizeInterviewer, dispatch, toast, session.id, requestReply]
  );

  // ---------- Live API ----------
  const onMessage = useCallback(
    (msg: LiveServerMessage) => {
      if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
        resumeHandle.current = msg.sessionResumptionUpdate.newHandle;
      }
      if (msg.goAway) {
        log.current.push({ t: now(), state: "goaway", note: msg.goAway.timeLeft });
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        rotateRef.current?.();
        return;
      }
      const sc = msg.serverContent;
      if (!sc) return;
      const t = now();
      if (sc.inputTranscription?.text) {
        if (!inBuf.current) inBuf.current = { text: "", start: Math.max(0, t - 1200), end: t };
        inBuf.current.text += sc.inputTranscription.text;
        inBuf.current.end = t;
        setCaption({ speaker: "candidate", name: "You", text: inBuf.current.text });
      }
      if (sc.outputTranscription?.text) {
        if (inBuf.current) finalizeCandidate();
        if (!outBuf.current) outBuf.current = { text: "", start: t, end: t, speaker: currentIv.current };
        outBuf.current.text += sc.outputTranscription.text;
        outBuf.current.end = t;
        // Panel attribution: speaker switches are announced by name ("Priya here — …").
        if (personas.length > 1) {
          const head = outBuf.current.text.slice(0, 60).toLowerCase();
          const hit = personas.find((p) => new RegExp(`\\b(${p.name.toLowerCase()} here|this is ${p.name.toLowerCase()}|i'm ${p.name.toLowerCase()})\\b`).test(head));
          if (hit) {
            outBuf.current.speaker = hit;
            currentIv.current = hit;
          }
        }
        setCaption({ speaker: outBuf.current.speaker.key, name: outBuf.current.speaker.name, text: outBuf.current.text });
      }
      const parts = sc.modelTurn?.parts ?? [];
      for (const p of parts) {
        if (p.inlineData?.data && p.inlineData.mimeType?.startsWith("audio/")) {
          if (inBuf.current) finalizeCandidate();
          player.current?.enqueue(p.inlineData.data);
        }
      }
      if (sc.interrupted) {
        player.current?.interrupt();
        finalizeInterviewer(" —");
      }
      if (sc.turnComplete) finalizeInterviewer();
    },
    [personas, finalizeCandidate, finalizeInterviewer]
  );

  const rotateRef = useRef<(() => void) | null>(null);
  const connectRef = useRef<((isReconnect: boolean) => Promise<void>) | null>(null);

  const onFailure = useCallback(
    (err: unknown) => {
      if (ending.current || machineRef.current.state === "fallback") return;
      connecting.current = false;
      closeLive();
      const e = err instanceof EngineError ? err : new EngineError("live", err instanceof Error ? err.message : "Voice connection failed");
      const note = `${e.kind}: ${e.message}`;
      setLastError(e.message);
      if (e.fatal) {
        dispatch({ type: "FATAL" }, note);
        toast(e.message, e.kind === "mic" ? "error" : "warn");
        setTimeout(() => goFallback(note), 400);
        return;
      }
      const next = dispatch({ type: "FAIL" }, note);
      if (next.state === "reconnecting") {
        toast(`Voice connection hiccup — reconnecting (${next.retries}/2)…`, "warn");
        setTimeout(() => void connectRef.current?.(true), 700 * next.retries);
      } else {
        toast("Voice couldn't recover after 2 attempts.", "error");
        setTimeout(() => goFallback(note), 400);
      }
    },
    [closeLive, dispatch, toast, goFallback]
  );

  const connectVoice = useCallback(
    async (isReconnect: boolean) => {
      if (connecting.current || ending.current) return;
      connecting.current = true;
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) throw new EngineError("network", "You appear to be offline. Check your network connection.");
        const tr = await withTimeout(
          fetch("/api/live/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.id }) }),
          10000,
          "Token request timed out."
        ).catch((e) => {
          throw e instanceof EngineError ? e : new EngineError("network", "Network error while starting voice.");
        });
        const tj = await tr.json().catch(() => ({}));
        if (!tr.ok) throw new EngineError(tj.code === "NO_KEY" ? "no_key" : "token", tj.error || "Couldn't start voice session.", tj.code === "NO_KEY" || tr.status === 401);

        // Mic + audio graph are created ONCE per interview.
        if (!mic.current) {
          const m = new MicCapture();
          try {
            await m.start();
          } catch (e) {
            throw new EngineError("mic", e instanceof MicError ? e.message : "Microphone failed to start.", true);
          }
          mic.current = m;
          m.onChunk = (b64) => {
            const s = live.current;
            if (!s || machineRef.current.state !== "connected") return;
            if (!handsFreeRef.current && !pttRef.current) return;
            try {
              s.sendRealtimeInput({ audio: { data: b64, mimeType: "audio/pcm;rate=16000" } });
            } catch {}
          };
          if (player.current && optsRef.current.recordAudio && m.stream) {
            const mixed = player.current.attachMic(m.stream);
            const mime = pickRecorderMime();
            if (mime) {
              try {
                const rec = new MediaRecorder(mixed ? player.current.recordDest.stream : m.stream, { mimeType: mime });
                rec.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
                rec.start(1000);
                recorder.current = rec;
              } catch {}
            }
          }
        }

        const ai = new GoogleGenAI({ apiKey: tj.token });
        const handle = resumeHandle.current;
        closingByUs.current = false;
        const s = await withTimeout(
          ai.live.connect({
            model: tj.model,
            config: { ...tj.config, sessionResumption: handle ? { handle } : {} },
            callbacks: {
              onopen: () => {},
              onmessage: (m: LiveServerMessage) => onMessage(m),
              onerror: (ev: ErrorEvent) => onFailure(new EngineError("live", ev?.message || "Live API error")),
              onclose: (ev: CloseEvent) => {
                if (closingByUs.current || ending.current) return;
                onFailure(new EngineError("live", `Connection closed${ev.reason ? `: ${ev.reason}` : ` (${ev.code})`}`));
              },
            },
          }),
          12000,
          "Voice connection timed out."
        );
        live.current = s;
        connecting.current = false;
        dispatch({ type: "OPEN" }, isReconnect ? "reconnected" : "connected");
        if (isReconnect) toast("Voice reconnected.", "success");
        if (!hadVoiceOpen.current && turnsRef.current.length === 0) {
          s.sendClientContent({ turns: [{ role: "user", parts: [{ text: "(The candidate has joined the call. Begin the interview now.)" }] }], turnComplete: true });
        } else if (!handle) {
          // No resumable handle: rehydrate context from our own transcript (source of truth).
          const recap = turnsRef.current
            .filter((t) => t.speaker !== "system")
            .slice(-14)
            .map((t) => `${t.speaker === "candidate" ? "Candidate" : t.speakerName}: ${t.text}`)
            .join("\n");
          s.sendClientContent({
            turns: [{ role: "user", parts: [{ text: `(Connection was briefly lost. Transcript so far:\n${recap}\nContinue the interview naturally from where it stopped — do not re-introduce yourself. If the candidate's last answer was cut off, ask them to finish it.)` }] }],
            turnComplete: true,
          });
        }
        hadVoiceOpen.current = true;
      } catch (e) {
        connecting.current = false;
        onFailure(e);
      }
    },
    [session.id, dispatch, onMessage, onFailure, toast]
  );
  connectRef.current = connectVoice;
  rotateRef.current = () => {
    if (machineRef.current.state !== "connected") return;
    closeLive();
    dispatch({ type: "GOAWAY" }, "server rotation");
    void connectVoice(true);
  };

  // ---------- public controls ----------
  const start = useCallback(async () => {
    if (started) return;
    setStarted(true);
    t0.current = performance.now();
    try {
      player.current = new PcmPlayer();
      await player.current.resume();
    } catch {}
    void fetch(`/api/sessions/${session.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) }).catch(() => {});
    dispatch({ type: "CONNECT" }, "start");
    await connectVoice(false);
  }, [started, session.id, dispatch, connectVoice]);

  const retryVoice = useCallback(async () => {
    if (machineRef.current.state !== "fallback") return;
    speechSynthesis?.cancel?.();
    dispatch({ type: "CONNECT" }, "manual retry");
    await connectVoice(true);
  }, [dispatch, connectVoice]);

  const switchToText = useCallback(() => {
    if (machineRef.current.state === "fallback") return;
    goFallback("user switched to text");
  }, [goFallback]);

  const setHandsFree = useCallback((v: boolean) => {
    handsFreeRef.current = v;
    setHandsFreeState(v);
  }, []);

  const pttDown = useCallback(() => {
    pttRef.current = true;
    setPttHeld(true);
    if (player.current?.isPlaying) {
      player.current.interrupt(); // local barge-in: stop interviewer audio instantly
      finalizeInterviewer(" —");
    }
  }, [finalizeInterviewer]);

  const pttUp = useCallback(() => {
    if (!pttRef.current) return;
    pttRef.current = false;
    setPttHeld(false);
    try {
      live.current?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {}
  }, []);

  const noteTyping = useCallback(() => {
    if (typingStart.current == null) typingStart.current = now();
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const start = typingStart.current ?? now();
      typingStart.current = null;
      addTurn({ speaker: "candidate", speakerName: "You", tsStartMs: start, tsEndMs: Math.max(now(), start + 500), text: clean, channel: "text" });
      if (machineRef.current.state === "connected" && live.current) {
        try {
          live.current.sendClientContent({ turns: [{ role: "user", parts: [{ text: clean }] }], turnComplete: true });
          return;
        } catch {}
      }
      await requestReply();
    },
    [addTurn, requestReply]
  );

  const end = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    closeLive();
    finalizeCandidate();
    finalizeInterviewer();
    try {
      speechSynthesis?.cancel?.();
    } catch {}
    const actualSeconds = Math.round(now() / 1000);
    let blob: Blob | null = null;
    if (recorder.current && recorder.current.state !== "inactive") {
      blob = await new Promise<Blob | null>((res) => {
        const r = recorder.current!;
        r.onstop = () => res(chunks.current.length ? new Blob(chunks.current, { type: r.mimeType }) : null);
        try {
          r.stop();
        } catch {
          res(null);
        }
        setTimeout(() => res(null), 2500);
      });
    }
    mic.current?.stop();
    player.current?.close();
    for (let i = 0; i < 3 && !(await flush()); i++) await new Promise((r) => setTimeout(r, 600));
    log.current.push({ t: now(), state: "ended" });
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "end", actualSeconds, log: log.current }),
    }).catch(() => {});
    if (blob && blob.size > 0) {
      await fetch(`/api/sessions/${session.id}/audio`, { method: "POST", headers: { "content-type": blob.type || "audio/webm" }, body: blob }).catch(() => {});
    }
  }, [closeLive, finalizeCandidate, finalizeInterviewer, flush, session.id]);

  const addBookmark = useCallback(
    async (note: string) => {
      const tMs = now();
      await fetch(`/api/sessions/${session.id}/bookmarks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tMs, note }) }).catch(() => {});
      return tMs;
    },
    [session.id]
  );

  // ---------- loops ----------
  useEffect(() => {
    if (!started) return;
    const flushTimer = setInterval(() => void flush(), 3000);
    const clock = setInterval(() => {
      const e = now();
      setElapsedMs(e);
      if (!timeUpSent.current && e >= session.plannedMinutes * 60000) {
        timeUpSent.current = true;
        optsRef.current.toast("Planned time reached. Wrap up whenever you're ready — ending early is always fine.", "info");
        if (machineRef.current.state === "connected" && live.current) {
          try {
            live.current.sendClientContent({ turns: [{ role: "user", parts: [{ text: "(Time check: the planned duration is up. Wrap up politely in one or two sentences.)" }] }], turnComplete: true });
          } catch {}
        } else if (machineRef.current.state === "fallback") void requestReply(true);
      }
    }, 500);
    let raf = 0;
    let lastSet = 0;
    const loop = (ts: number) => {
      if (ts - lastSet > 120) {
        lastSet = ts;
        const out = player.current?.isPlaying ? player.current.level() : 0;
        const inL = mic.current && (handsFreeRef.current || pttRef.current) ? mic.current.level() : 0;
        setActiveSpeaker(out > 0.04 ? currentIv.current.key : inL > 0.08 ? "candidate" : null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onUnload = () => {
      if (pending.current.length) navigator.sendBeacon(`/api/sessions/${session.id}/turns`, new Blob([JSON.stringify({ turns: pending.current })], { type: "application/json" }));
    };
    const onOffline = () => optsRef.current.toast("Network lost — we'll keep your transcript locally and retry.", "warn");
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("offline", onOffline);
    return () => {
      clearInterval(flushTimer);
      clearInterval(clock);
      cancelAnimationFrame(raf);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("offline", onOffline);
    };
  }, [started, flush, session.id, session.plannedMinutes, requestReply]);

  // Tear-down on unmount (never leave mic open).
  useEffect(
    () => () => {
      closingByUs.current = true;
      try {
        live.current?.close();
      } catch {}
      mic.current?.stop();
      player.current?.close();
    },
    []
  );

  const getLevels = useCallback(
    () => ({
      mic: mic.current && (handsFreeRef.current || pttRef.current) ? mic.current.level() : 0,
      out: player.current?.isPlaying ? player.current.level() : 0,
    }),
    []
  );

  const conn: ConnState = machine.state;
  return {
    conn,
    retries: machine.retries,
    started,
    turns,
    caption,
    activeSpeaker,
    handsFree,
    setHandsFree,
    pttHeld,
    pttDown,
    pttUp,
    thinking,
    elapsedMs,
    lastError,
    start,
    end,
    retryVoice,
    switchToText,
    sendText,
    noteTyping,
    requestReply,
    addBookmark,
    getLevels,
  };
}
