"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileText, Globe, Upload, Users, X } from "lucide-react";
import { Badge, Button, Card, Input, Label, Segmented, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { DIFFICULTIES, getPersonas, INTERVIEW_TYPES, typeLabel, type Difficulty, type InterviewType } from "@/lib/types";

const STEPS = ["Interview", "Difficulty & time", "Materials", "Review"];

function FileDrop({ label, kind, value, onText, optional }: { label: string; kind: string; value: string; onText: (t: string, name: string) => void; optional?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const toast = useToast();
  async function upload(f: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", kind);
      const r = await fetch("/api/uploads", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setName(f.name);
      onText(j.text, f.name);
      toast(`${label} uploaded · ${j.text.length.toLocaleString()} characters extracted`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div>
      <Label hint={optional ? "optional" : undefined}>{label}</Label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        className="flex items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-3"
      >
        <FileText className="h-4 w-4 text-white/40" />
        <div className="min-w-0 flex-1 text-sm">
          {value ? (
            <span className="text-white/80">{name || "Pasted text"} · <span className="text-white/40">{value.length.toLocaleString()} chars</span></span>
          ) : (
            <span className="text-white/40">Drop PDF / TXT / MD or browse</span>
          )}
        </div>
        {value && (
          <button type="button" onClick={() => { onText("", ""); setName(""); }} className="text-white/40 hover:text-white" aria-label="Clear"><X className="h-4 w-4" /></button>
        )}
        <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => ref.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
        <input ref={ref} type="file" accept=".pdf,.txt,.md,.docx,text/plain,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
    </div>
  );
}

export function SetupWizard({ defaultDifficulty, defaultType }: { defaultDifficulty: Difficulty; defaultType: string }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [type, setType] = useState<InterviewType>((INTERVIEW_TYPES.find((t) => t.id === defaultType)?.id ?? "hr") as InterviewType);
  const [customType, setCustomType] = useState("");
  const [panel, setPanel] = useState<1 | 2>(1);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaultDifficulty);
  const [duration, setDuration] = useState<number | "custom">(30);
  const [customMin, setCustomMin] = useState(15);
  const [roleTitle, setRoleTitle] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [cvText, setCv] = useState("");
  const [coverText, setCover] = useState("");
  const [jdText, setJd] = useState("");
  const [creating, setCreating] = useState(false);

  const planned = duration === "custom" ? customMin : duration;
  const effectivePanel = type === "technical" || type === "coding" ? 2 : type === "hr" ? 1 : panel;
  const personas = getPersonas(type, effectivePanel);
  const urlValid = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(companyUrl.trim());

  const canNext = [
    type !== "custom" || customType.trim().length > 3,
    planned >= 1 && planned <= 240,
    urlValid,
    true,
  ][step];

  const go = (d: number) => {
    setDir(d);
    setStep((s) => Math.min(STEPS.length - 1, Math.max(0, s + d)));
  };

  async function create() {
    setCreating(true);
    try {
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewType: type, customType, difficulty, plannedMinutes: planned, panelSize: effectivePanel, roleTitle, companyUrl, cvText, coverLetterText: coverText, jdText }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      router.push(`/interview/${j.session.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create session", "error");
      setCreating(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12">
        <h1 className="display text-white">Set up your interview</h1>
        <p className="mt-2 text-white/50">Four quick steps. The more context you give, the sharper the questions.</p>
      </div>

      {/* Stepper */}
      <div className="col-span-12 md:col-span-3">
        <ol className="relative space-y-1">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                onClick={() => i < step && go(i - step)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${i === step ? "bg-white/[0.06] text-white" : i < step ? "text-white/70 hover:text-white" : "text-white/35"}`}
              >
                <motion.span
                  animate={{ backgroundColor: i < step ? "#34d3a4" : "rgba(0,0,0,0)", borderColor: i <= step ? "#34d3a4" : "rgba(255,255,255,0.15)" }}
                  transition={{ duration: 0.2 }}
                  className="flex h-6 w-6 items-center justify-center rounded-full border text-xs"
                >
                  {i < step ? <Check className="h-3.5 w-3.5 text-ink" /> : i + 1}
                </motion.span>
                {s}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <Card className="col-span-12 overflow-hidden p-8 md:col-span-9">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="min-h-[380px]"
          >
            {step === 0 && (
              <div className="space-y-6">
                <h2 className="title text-white">What kind of interview?</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {INTERVIEW_TYPES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setType(t.id)}
                      className={`rounded-2xl border p-4 text-left transition-all duration-200 ${type === t.id ? "border-accent/60 bg-accent/[0.07]" : "border-white/10 hover:border-white/20 hover:bg-white/[0.03]"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white">{t.label}</span>
                        {type === t.id && <Check className="h-4 w-4 text-accent" />}
                      </div>
                      <div className="mt-1 text-sm text-white/45">{t.blurb}</div>
                    </button>
                  ))}
                </div>
                {type === "custom" && (
                  <div>
                    <Label>Describe the interview</Label>
                    <Textarea rows={3} value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="e.g. Product Manager case interview focused on prioritization and metrics" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-2 text-sm text-white/60"><Users className="h-4 w-4" /> Interviewers</span>
                  {type === "situational" || type === "custom" ? (
                    <Segmented value={panel} onChange={(v) => setPanel(v)} options={[{ value: 1, label: "1 interviewer" }, { value: 2, label: "2-person panel" }]} />
                  ) : (
                    <Badge>{effectivePanel === 2 ? "2-person panel" : "1 interviewer"}</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {personas.map((p) => (
                    <div key={p.key} className="flex items-center gap-3 rounded-2xl border border-white/10 px-3 py-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-deep/60 text-xs font-semibold">{p.initials}</span>
                      <div>
                        <div className="text-sm text-white">{p.name} · <span className="text-white/50">{p.title}</span></div>
                        <div className="text-xs text-white/40">{p.style}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-8">
                <div>
                  <h2 className="title text-white">How tough should it be?</h2>
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setDifficulty(d.id)}
                        className={`rounded-2xl border p-4 text-left transition-all duration-200 ${difficulty === d.id ? "border-accent/60 bg-accent/[0.07]" : "border-white/10 hover:border-white/20"}`}
                      >
                        <div className="font-medium text-white">{d.label}</div>
                        <div className="mt-1 text-sm leading-snug text-white/45">{d.blurb}</div>
                      </button>
                    ))}
                  </div>
                  {difficulty === "hard" && (
                    <p className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100/80">
                      Expect lines like “That&apos;s vague. Give me a concrete example and measurable impact.” and “What did YOU do specifically?”
                    </p>
                  )}
                </div>
                <div>
                  <Label hint="a plan, not a requirement — end any time">Planned duration</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Segmented value={duration} onChange={setDuration} options={[{ value: 30, label: "30 min" }, { value: 60, label: "60 min" }, { value: 120, label: "120 min" }, { value: "custom", label: "Custom" }]} />
                    {duration === "custom" && (
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} max={240} value={customMin} onChange={(e) => setCustomMin(Math.max(1, Math.min(240, Number(e.target.value) || 1)))} className="!h-9 w-24" />
                        <span className="text-sm text-white/45">minutes</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <h2 className="title text-white">Give the panel context</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label hint="required">Company website</Label>
                    <div className="relative">
                      <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                      <Input value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} placeholder="company.com" className="pl-10" />
                    </div>
                    {companyUrl && !urlValid && <p className="mt-1.5 text-xs text-rose-300">Enter a valid website, e.g. stripe.com</p>}
                  </div>
                  <div>
                    <Label hint="optional">Role title</Label>
                    <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Senior Backend Engineer" />
                  </div>
                </div>
                <FileDrop label="CV / Résumé" kind="cv" value={cvText} onText={(t) => setCv(t)} optional />
                <FileDrop label="Cover letter" kind="cover" value={coverText} onText={(t) => setCover(t)} optional />
                <div>
                  <FileDrop label="Job description" kind="jd" value={jdText} onText={(t) => setJd(t)} optional />
                  <Textarea rows={4} className="mt-2" value={jdText} onChange={(e) => setJd(e.target.value)} placeholder="…or paste the job description here" />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <h2 className="title text-white">Ready when you are</h2>
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  {[
                    ["Type", typeLabel(type, customType)],
                    ["Difficulty", difficulty[0].toUpperCase() + difficulty.slice(1)],
                    ["Planned", `${planned} min`],
                    ["Panel", personas.map((p) => p.name).join(" & ")],
                    ["Company", companyUrl],
                    ["Role", roleTitle || "Inferred from JD"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-2xl border border-white/[0.08] p-4">
                      <dt className="text-xs uppercase tracking-[0.12em] text-white/40">{k}</dt>
                      <dd className="mt-1 truncate text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={cvText ? "accent" : "neutral"}>CV {cvText ? "✓" : "—"}</Badge>
                  <Badge tone={coverText ? "accent" : "neutral"}>Cover letter {coverText ? "✓" : "—"}</Badge>
                  <Badge tone={jdText ? "accent" : "neutral"}>Job description {jdText ? "✓" : "—"}</Badge>
                </div>
                <p className="text-sm leading-relaxed text-white/45">
                  You&apos;ll be asked for microphone access. If voice is unavailable, the interview continues in text automatically — your transcript and debrief are never lost. Ending early still produces a partial-session debrief.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-6">
          <Button variant="ghost" onClick={() => go(-1)} disabled={step === 0}>Back</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => go(1)} disabled={!canNext}>Continue</Button>
          ) : (
            <Button onClick={create} loading={creating} size="lg">Enter interview room</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
