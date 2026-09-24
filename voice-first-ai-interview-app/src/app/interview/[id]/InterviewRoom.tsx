"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Captions, Keyboard, Loader2, Mic, MicOff, NotebookPen, PanelRight, PhoneOff, RefreshCw, Send, Wifi, WifiOff, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Badge, Button, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Waveform } from "@/components/Waveform";
import { useInterviewEngine } from "@/lib/live/useInterviewEngine";
import { fmtTs, typeLabel, type Persona, type SessionDTO } from "@/lib/types";
import type { ConnState } from "@/lib/live/machine";

type Settings = { recordAudio: boolean; readAloudFallback: boolean; captions: boolean; handsFreeDefault: boolean };

const connMeta: Record<ConnState, { label: string; tone: "neutral" | "accent" | "warn" | "danger" }> = {
  idle: { label: "Ready", tone: "neutral" },
  connecting: { label: "Connecting…", tone: "warn" },
  connected: { label: "Live voice", tone: "accent" },
  reconnecting: { label: "Reconnecting…", tone: "warn" },
  error: { label: "Voice error", tone: "danger" },
  fallback: { label: "Text mode", tone: "neutral" },
};

type SR = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null; onend: (() => void) | null; continuous: boolean; interimResults: boolean; lang: string };

export function InterviewRoom({ session, personas, settings }: { session: SessionDTO; personas: Persona[]; settings: Settings }) {
  const router = useRouter();
  const toast = useToast();
  const eng = useInterviewEngine({ session, personas, toast, recordAudio: settings.recordAudio, readAloudFallback: settings.readAloudFallback, handsFreeDefault: settings.handsFreeDefault });
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<"captions" | "notes" | "bookmarks">("captions");
  const [captionsOn, setCaptionsOn] = useState(settings.captions);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [bms, setBms] = useState<{ tMs: number; note: string }[]>([]);
  const [bmNote, setBmNote] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [dictating, setDictating] = useState(false);
  const srRef = useRef<SR | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const planned = session.plannedMinutes * 60000;
  const progress = Math.min(1, eng.elapsedMs / planned);
  const fallback = eng.conn === "fallback";
  const lastIv = [...eng.turns].reverse().find((t) => t.speaker !== "candidate");

  useEffect(() => {
    setNotes(localStorage.getItem(`nos-notes-${session.id}`) || "");
  }, [session.id]);
  useEffect(() => {
    localStorage.setItem(`nos-notes-${session.id}`, notes);
  }, [notes, session.id]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [eng.turns.length, eng.caption?.text]);

  // Space = push-to-talk (when not typing)
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => ["TEXTAREA", "INPUT"].includes((e.target as HTMLElement)?.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e) && !eng.handsFree && eng.conn === "connected" && !e.repeat) {
        e.preventDefault();
        eng.pttDown();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e)) eng.pttUp();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [eng]);

  async function doEnd() {
    setEnding(true);
    srRef.current?.stop();
    await eng.end();
    router.push(`/debrief/${session.id}?fresh=1`);
  }

  function toggleDictation() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return toast("Dictation isn't supported in this browser — type your answer instead.", "warn");
    if (dictating) {
      srRef.current?.stop();
      return;
    }
    const sr = new Ctor();
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = "en-US";
    const base = text ? text + " " : "";
    sr.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      eng.noteTyping();
      setText(base + s);
    };
    sr.onend = () => setDictating(false);
    srRef.current = sr;
    sr.start();
    setDictating(true);
  }

  async function send() {
    if (!text.trim()) return;
    srRef.current?.stop();
    const t = text;
    setText("");
    await eng.sendText(t);
  }

  async function bookmark() {
    const tMs = await eng.addBookmark(bmNote);
    setBms((b) => [...b, { tMs, note: bmNote }]);
    setBmNote("");
    toast(`Bookmarked at ${fmtTs(tMs)}`, "success");
  }

  const meta = connMeta[eng.conn];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="mx-auto flex h-16 w-full max-w-[1100px] items-center gap-3 px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/40"><span className="h-2 w-2 rounded-full bg-accent" /></span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{typeLabel(session.interviewType, session.customType)}</Badge>
          <Badge tone={session.difficulty === "hard" ? "danger" : session.difficulty === "easy" ? "accent" : "neutral"}>{session.difficulty}</Badge>
          <Badge tone={meta.tone}>
            {eng.conn === "connected" ? <Wifi className="h-3 w-3" /> : eng.conn === "fallback" || eng.conn === "error" ? <WifiOff className="h-3 w-3" /> : <Loader2 className={`h-3 w-3 ${eng.conn === "idle" ? "" : "animate-spin"}`} />}
            {meta.label}
            {eng.conn === "reconnecting" && ` ${eng.retries}/2`}
          </Badge>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <div className="font-mono text-lg tabular-nums text-white">{fmtTs(eng.elapsedMs)}</div>
            <div className="text-[11px] text-white/40">of {session.plannedMinutes}:00 planned</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDrawer((d) => !d)} aria-label="Toggle drawer"><PanelRight className="h-4 w-4" /></Button>
          <Button variant="danger" size="sm" onClick={() => (eng.started ? setConfirmEnd(true) : router.push("/dashboard"))} disabled={ending}>
            <PhoneOff className="h-3.5 w-3.5" /> {eng.started ? "End" : "Leave"}
          </Button>
        </div>
      </header>
      <div className="mx-auto h-px w-full max-w-[1100px] bg-white/[0.06]">
        <motion.div className="h-px bg-accent" animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.4 }} />
      </div>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 gap-6 px-6 py-8">
        <section className="flex flex-1 flex-col">
          {/* Stage */}
          <div className="glass relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl px-6 py-10">
            <div className="flex flex-wrap items-start justify-center gap-10 sm:gap-16">
              {personas.map((p) => (
                <Avatar key={p.key} initials={p.initials} name={p.name} title={p.title} speaking={eng.activeSpeaker === p.key || (fallback && eng.thinking && lastIv?.speaker === p.key)} size={personas.length > 1 ? 96 : 120} />
              ))}
              <Avatar initials="YOU" name="You" title={fallback ? "Typing / dictating" : eng.handsFree ? "Hands-free" : eng.pttHeld ? "Talking…" : "Hold to talk"} speaking={eng.activeSpeaker === "candidate"} size={personas.length > 1 ? 96 : 120} you />
            </div>

            <div className="mt-10 w-full max-w-[560px]">
              <Waveform getLevel={() => { const l = eng.getLevels(); return Math.max(l.mic, l.out); }} active={eng.conn === "connected"} />
            </div>

            {/* Live captions */}
            <div className="mt-6 min-h-[72px] w-full max-w-[680px] text-center">
              <AnimatePresence mode="wait">
                {captionsOn && (eng.caption || lastIv) && (
                  <motion.p key={eng.caption ? eng.caption.speaker : lastIv?.clientId} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="text-[17px] leading-relaxed text-white/80">
                    <span className="mr-2 text-sm font-medium text-accent">{eng.caption ? eng.caption.name : lastIv?.speakerName}</span>
                    {eng.caption ? eng.caption.text : lastIv?.text}
                  </motion.p>
                )}
              </AnimatePresence>
              {fallback && eng.thinking && <p className="mt-2 inline-flex items-center gap-2 text-sm text-white/40"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Interviewer is thinking…</p>}
            </div>

            {/* Pre-start */}
            <AnimatePresence>
              {!eng.started && (
                <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0c0e]/80 backdrop-blur-md">
                  <h2 className="title text-white">Your panel is ready</h2>
                  <p className="mt-2 max-w-[440px] text-center text-sm text-white/50">
                    {personas.map((p) => p.name).join(" & ")} will lead a {session.difficulty} {typeLabel(session.interviewType, session.customType)} interview at {session.companyName || session.companyUrl}. End whenever you like — you&apos;ll still get a debrief.
                  </p>
                  <div className="mt-6 flex items-center gap-3 text-sm text-white/60">
                    <button onClick={() => eng.setHandsFree(true)} className={`rounded-full border px-4 py-1.5 ${eng.handsFree ? "border-accent/60 text-white" : "border-white/10"}`}>Hands-free</button>
                    <button onClick={() => eng.setHandsFree(false)} className={`rounded-full border px-4 py-1.5 ${!eng.handsFree ? "border-accent/60 text-white" : "border-white/10"}`}>Push-to-talk</button>
                  </div>
                  <Button size="lg" className="mt-6" onClick={() => void eng.start()}><Mic className="h-4 w-4" /> Begin interview</Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="mt-4">
            {fallback ? (
              <div className="glass rounded-3xl p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
                  <span className="inline-flex items-center gap-1.5"><Keyboard className="h-3.5 w-3.5" /> Text mode — the interview continues and everything is logged.</span>
                  <div className="flex gap-2">
                    {!eng.thinking && lastIv?.speaker === undefined && <Button size="sm" variant="outline" onClick={() => void eng.requestReply()}>Start</Button>}
                    {!eng.thinking && eng.turns.at(-1)?.speaker === "candidate" && <Button size="sm" variant="outline" onClick={() => void eng.requestReply()}>Ask again</Button>}
                    <Button size="sm" variant="ghost" onClick={() => void eng.retryVoice()}><RefreshCw className="h-3.5 w-3.5" /> Try voice again</Button>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    value={text}
                    onChange={(e) => {
                      eng.noteTyping();
                      setText(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Type your answer… (Enter to send, Shift+Enter for new line)"
                    className="flex-1 resize-none"
                  />
                  <Button variant={dictating ? "danger" : "outline"} onClick={toggleDictation} aria-label="Dictate">{dictating ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>
                  <Button onClick={() => void send()} disabled={!text.trim() || eng.thinking} aria-label="Send"><Send className="h-4 w-4" /></Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
                  {[true, false].map((hf) => (
                    <button key={String(hf)} onClick={() => eng.setHandsFree(hf)} className={`rounded-full px-4 py-1.5 transition-colors ${eng.handsFree === hf ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>
                      {hf ? "Hands-free" : "Push-to-talk"}
                    </button>
                  ))}
                </div>
                {!eng.handsFree && (
                  <motion.button
                    onPointerDown={(e) => {
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      eng.pttDown();
                    }}
                    onPointerUp={eng.pttUp}
                    onPointerCancel={eng.pttUp}
                    whileTap={{ scale: 0.96 }}
                    disabled={eng.conn !== "connected"}
                    className={`flex h-14 items-center gap-2 rounded-full px-8 text-[15px] font-medium transition-colors disabled:opacity-40 ${eng.pttHeld ? "bg-accent text-ink shadow-[0_0_40px_rgba(52,211,164,0.5)]" : "border border-accent/40 text-accent"}`}
                  >
                    <Mic className="h-4 w-4" /> {eng.pttHeld ? "Listening…" : "Hold to talk (Space)"}
                  </motion.button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setCaptionsOn((c) => !c)}><Captions className="h-4 w-4" /> {captionsOn ? "Hide" : "Show"} captions</Button>
                <Button variant="ghost" size="sm" onClick={eng.switchToText} disabled={!eng.started}><Keyboard className="h-4 w-4" /> Switch to text</Button>
              </div>
            )}
          </div>
        </section>

        {/* Drawer */}
        <AnimatePresence>
          {drawer && (
            <motion.aside initial={{ opacity: 0, x: 24, width: 0 }} animate={{ opacity: 1, x: 0, width: 340 }} exit={{ opacity: 0, x: 24, width: 0 }} transition={{ duration: 0.22 }} className="glass hidden shrink-0 flex-col overflow-hidden rounded-3xl md:flex">
              <div className="flex items-center gap-1 border-b border-white/[0.06] p-2">
                {([
                  ["captions", Captions, "Captions"],
                  ["notes", NotebookPen, "Notes"],
                  ["bookmarks", Bookmark, "Bookmarks"],
                ] as const).map(([k, I, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs ${tab === k ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white"}`}>
                    <I className="h-3.5 w-3.5" /> {l}
                  </button>
                ))}
                <button onClick={() => setDrawer(false)} className="p-1.5 text-white/40 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
              {tab === "captions" && (
                <div ref={listRef} className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 220px)" }}>
                  {eng.turns.length === 0 && !eng.caption && <p className="text-sm text-white/35">The transcript will appear here.</p>}
                  {eng.turns.map((t) => (
                    <div key={t.clientId} className="text-sm">
                      <div className="mb-0.5 flex items-center gap-2 text-[11px] text-white/35">
                        <span className={t.speaker === "candidate" ? "text-white/60" : "text-accent"}>{t.speakerName}</span>
                        <span className="font-mono">{fmtTs(t.tsStartMs)}</span>
                        {t.channel === "text" && <span>· text</span>}
                      </div>
                      <p className="leading-relaxed text-white/80">{t.text}</p>
                    </div>
                  ))}
                  {eng.caption && (
                    <div className="text-sm opacity-60">
                      <div className="mb-0.5 text-[11px] text-white/35">{eng.caption.name} · live</div>
                      <p className="leading-relaxed text-white/80">{eng.caption.text}</p>
                    </div>
                  )}
                </div>
              )}
              {tab === "notes" && (
                <div className="flex-1 p-4">
                  <Textarea rows={16} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Private scratch notes (saved on this device)…" className="h-full resize-none" />
                </div>
              )}
              {tab === "bookmarks" && (
                <div className="flex-1 space-y-3 p-4">
                  <div className="flex gap-2">
                    <input value={bmNote} onChange={(e) => setBmNote(e.target.value)} placeholder="What happened here?" className="h-9 flex-1 rounded-full border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white outline-none focus:border-accent/50" />
                    <Button size="sm" onClick={bookmark} disabled={!eng.started}><Bookmark className="h-3.5 w-3.5" /></Button>
                  </div>
                  {bms.map((b, i) => (
                    <div key={i} className="flex gap-3 text-sm"><span className="font-mono text-accent">{fmtTs(b.tMs)}</span><span className="text-white/70">{b.note || "Bookmark"}</span></div>
                  ))}
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* End confirm */}
      <AnimatePresence>
        {confirmEnd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.97, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.2 }} className="glass w-full max-w-[420px] rounded-3xl p-7">
              <h2 className="text-xl font-semibold text-white">{eng.elapsedMs < planned * 0.9 ? "End early?" : "End interview?"}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                {eng.elapsedMs < planned * 0.9
                  ? `You've practiced ${fmtTs(eng.elapsedMs)} of ${session.plannedMinutes}:00. That's completely fine — you'll get a PARTIAL SESSION DEBRIEF built from everything said so far.`
                  : "We'll save your transcript and generate your debrief."}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmEnd(false)} disabled={ending}>Keep going</Button>
                <Button onClick={doEnd} loading={ending}>End & get debrief</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
