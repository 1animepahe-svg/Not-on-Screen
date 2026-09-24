"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { Button, Card, Input, Label, Segmented } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { INTERVIEW_TYPES, type Difficulty } from "@/lib/types";
import type { UserSettings } from "@/db/schema";

const VOICES = ["Auto", "Aoede", "Charon", "Kore", "Fenrir", "Puck", "Leda", "Orus", "Zephyr"];

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-4 rounded-2xl p-3 text-left transition-colors hover:bg-white/[0.03]">
      <div>
        <div className="text-sm text-white">{label}</div>
        <div className="text-xs text-white/45">{hint}</div>
      </div>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${value ? "bg-accent" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all duration-200 ${value ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function SettingsForm({ initial, status }: { initial: { name: string; email: string; provider: string; settings: UserSettings }; status: { firebase: boolean; gemini: boolean; liveModel: string; textModel: string } }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [s, setS] = useState<UserSettings>({ recordAudio: true, readAloudFallback: true, captions: true, handsFreeDefault: true, defaultDifficulty: "medium", defaultType: "hr", ...initial.settings });
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<UserSettings>) => setS((x) => ({ ...x, ...p }));

  async function save() {
    setSaving(true);
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, settings: { ...s, voiceName: s.voiceName === "Auto" ? "" : s.voiceName } }) });
    setSaving(false);
    if (r.ok) {
      toast("Settings saved", "success");
      router.refresh();
    } else toast("Couldn't save settings", "error");
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 mb-2">
        <h1 className="display text-white">Settings</h1>
      </div>
      <Card className="col-span-12 space-y-5 p-8 md:col-span-7">
        <h2 className="text-lg font-semibold text-white">Profile</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label hint={initial.provider}>Email</Label><Input value={initial.email} disabled className="opacity-60" /></div>
        </div>
        <h2 className="pt-4 text-lg font-semibold text-white">Interview defaults</h2>
        <div>
          <Label>Default difficulty</Label>
          <Segmented value={(s.defaultDifficulty ?? "medium") as Difficulty} onChange={(v) => set({ defaultDifficulty: v })} options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
        </div>
        <div>
          <Label>Default interview type</Label>
          <div className="flex flex-wrap gap-2">
            {INTERVIEW_TYPES.map((t) => (
              <button key={t.id} onClick={() => set({ defaultType: t.id })} className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${s.defaultType === t.id ? "border-accent/60 bg-accent/10 text-white" : "border-white/10 text-white/60 hover:text-white"}`}>{t.label}</button>
            ))}
          </div>
        </div>
        <div>
          <Label>Interviewer voice (Gemini Live)</Label>
          <div className="flex flex-wrap gap-2">
            {VOICES.map((v) => (
              <button key={v} onClick={() => set({ voiceName: v })} className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${(s.voiceName || "Auto") === v ? "border-accent/60 bg-accent/10 text-white" : "border-white/10 text-white/60 hover:text-white"}`}>{v}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1 pt-2">
          <Toggle label="Hands-free by default" hint="Otherwise start in push-to-talk (hold Space)." value={!!s.handsFreeDefault} onChange={(v) => set({ handsFreeDefault: v })} />
          <Toggle label="Record session audio" hint="Stored with your session for replay. Both sides are mixed when supported." value={!!s.recordAudio} onChange={(v) => set({ recordAudio: v })} />
          <Toggle label="Live captions" hint="Show what's being said on the stage." value={!!s.captions} onChange={(v) => set({ captions: v })} />
          <Toggle label="Read replies aloud in text mode" hint="Uses your browser's speech voice when Live voice is unavailable." value={!!s.readAloudFallback} onChange={(v) => set({ readAloudFallback: v })} />
        </div>
        <div className="flex justify-end pt-2"><Button onClick={save} loading={saving}>Save changes</Button></div>
      </Card>
      <Card className="col-span-12 h-fit space-y-4 p-8 md:col-span-5">
        <h2 className="text-lg font-semibold text-white">System status</h2>
        {[
          ["Firebase Auth", status.firebase, status.firebase ? "Enabled (email, Google)" : "Not configured — using built-in secure auth"],
          ["Gemini API", status.gemini, status.gemini ? `Live: ${status.liveModel} · Debrief: ${status.textModel}` : "Not configured — text mode + offline interviewer & analyzer"],
        ].map(([k, ok, d]) => (
          <div key={String(k)} className="flex items-start gap-3">
            {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" /> : <CircleSlash className="mt-0.5 h-4 w-4 text-white/35" />}
            <div>
              <div className="text-sm text-white">{k}</div>
              <div className="text-xs text-white/45">{d}</div>
            </div>
          </div>
        ))}
        <p className="border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-white/40">
          Set GEMINI_API_KEY for real-time voice and AI debriefs, and NEXT_PUBLIC_FIREBASE_* keys to switch sign-in to Firebase Auth.
        </p>
      </Card>
    </div>
  );
}
