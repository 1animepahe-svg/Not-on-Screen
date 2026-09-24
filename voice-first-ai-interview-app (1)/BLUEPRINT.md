# Not on screen — Build Blueprint

Voice-first AI interview practice: Gemini Live panel, error-resistant session engine, debrief built from the transcript.

> **Scope note.** This is a *practice* tool. It doesn't try to hide itself from screen sharing or proctoring, because that would only be useful for concealing AI help during a real interview. Browser apps can't do that anyway.

---

## 1. Step-by-step build plan

1. **Data model** (`src/db/schema.ts`): users → interview_sessions → transcript_turns / bookmarks / debriefs / recordings; uploads for original CV/JD files.
2. **Auth** (`src/lib/auth.ts`, `/api/auth/*`): Firebase Auth when `NEXT_PUBLIC_FIREBASE_*` is set (email/password, Google, reset email). The ID token is verified on the server against Google's JWKS and exchanged for an httpOnly session cookie. Without Firebase keys, the app uses built-in scrypt email/password auth, so it always works.
3. **Prompts** (`src/lib/prompts.ts`): personas, difficulty rules, follow-up rules, panel protocol, debrief system prompt.
4. **Live engine** (`src/lib/live/*`): AudioWorklet mic → 16 kHz PCM16 → Live API. 24 kHz playback with barge-in. State machine, reconnect (max 2), fallback to text.
5. **Transcript logger**: turns are finalized on the client, queued, and flushed every 3 s to an idempotent upsert keyed by `clientId`. `sendBeacon` runs on unload.
6. **Fallback interviewer** (`/api/interview/reply`): Gemini text in JSON mode, then a deterministic local interviewer that still follows the difficulty rules.
7. **Debrief pipeline** (`src/lib/debrief.ts`, `/api/sessions/[id]/debrief`): JSON schema → normalize → validate → repair retry → heuristic fallback → save a new version.
8. **UI**: Landing → Auth → Dashboard → Setup Wizard → Interview Room → Debrief → Replay → Settings.
9. **Validation**: typegen, tsc, build, health check.

## 2. Folder structure

```
src/
  app/
    page.tsx                      # Landing
    auth/{page,AuthForm}.tsx      # Sign in / Sign up / Forgot (+ Google)
    auth/reset/page.tsx
    (app)/layout.tsx              # requireUser + header
    (app)/dashboard/page.tsx      # start, recent sessions, insights
    (app)/setup/SetupWizard.tsx   # animated 4-step stepper
    (app)/debrief/[id]/DebriefView.tsx
    (app)/replay/[id]/ReplayView.tsx
    (app)/settings/SettingsForm.tsx
    interview/[id]/InterviewRoom.tsx
    api/
      auth/{signup,signin,firebase,forgot,reset,signout,me}
      sessions/           GET list, POST create (fetches company site context)
      sessions/[id]/      GET full, PATCH start|mode|end, DELETE
      sessions/[id]/turns       POST idempotent batch
      sessions/[id]/bookmarks   POST
      sessions/[id]/debrief     POST generate/regenerate
      sessions/[id]/audio       POST upload, GET stream
      live/token          POST ephemeral Gemini Live token
      interview/reply     POST fallback_text interviewer turn
      uploads             POST file → stored + extracted text (PDF/TXT/MD/DOCX)
      settings            GET/PATCH
  lib/
    live/machine.ts       # pure connection state machine
    live/audio.ts         # MicCapture, PcmPlayer, recorder helpers
    live/useInterviewEngine.ts
    prompts.ts  debrief.ts  local-interviewer.ts  gemini.ts  auth.ts  sessions.ts  types.ts
  components/             # Toast, ui, Waveform, Avatar(speaking ring), ScoreRing, AppHeader
```

**Google-native mapping.** Postgres tables line up 1:1 with Firestore collections: `users/{uid}`, `users/{uid}/sessions/{sid}`, `…/turns`, `…/debriefs`. The `uploads` and `recordings` blobs line up with Cloud Storage paths `users/{uid}/sessions/{sid}/{cv|jd|audio}`. To move over, replace `db` calls in `src/lib/sessions.ts` and the route handlers.

## 3. Key pseudocode

### Mic streaming → Live API
```ts
mic = getUserMedia({echoCancellation, noiseSuppression})
worklet 'nos-capture' posts Float32 frames (~2048 samples)
onFrame(f32) => pcm16 = downsample(f32, ctx.sampleRate → 16000)
  if (state === 'connected' && (handsFree || pttHeld))
     session.sendRealtimeInput({ audio: { data: b64(pcm16), mimeType: 'audio/pcm;rate=16000' } })
pttUp => session.sendRealtimeInput({ audioStreamEnd: true })
```

### Audio playback + interruption
```ts
onmessage(msg):
  for part in msg.serverContent.modelTurn.parts: if audio → player.enqueue(b64)  // gapless: start = max(now, nextTime)
  if msg.serverContent.interrupted → player.interrupt()   // stop() every queued source, nextTime = 0
pttDown while player.isPlaying → player.interrupt()       // local barge-in, instant
```

### Transcript logging
```ts
inputTranscription  → inBuf  (candidate; start=first chunk, end=last chunk)
outputTranscription → finalize inBuf; outBuf (interviewer; panel speaker detected by "Priya here —")
turnComplete / interrupted → finalize outBuf (end = now + player.remainingMs)
addTurn({speaker, timestamp_start, timestamp_end, text}) → pending queue
every 3 s: POST /turns (ON CONFLICT (session_id, client_id) DO NOTHING); failures stay queued
beforeunload: navigator.sendBeacon(pending)
fallback_text: typed/dictated answers and replies go through the same addTurn()
```

### Retry / fallback (state machine)
```
idle → connecting → connected
FAIL & retries<2 → reconnecting (retries++) → connect again (resume handle, or re-send the transcript recap)
FAIL & retries≥2 → error → fallback
FATAL (mic blocked / no API key / 401) → error → fallback (no retries)
GOAWAY → reconnecting without using up a retry
fallback: close Live, keep the session and transcript going, POST /interview/reply, optional speechSynthesis
"Try voice again" → connecting (retries reset)
```
Mic and audio graph are created **once**. There is one Live session per interview, and reconnects resume it with the `sessionResumption` handle.

### End-session finalization
```ts
end(): close Live → finalize buffers → stop recorder → stop mic
       flush turns (3 attempts) → PATCH {action:'end', actualSeconds, log}
       status = actual < 0.9 * planned ? 'ended_early' : 'completed'
       upload audio blob → router.push('/debrief/:id')
Debrief page: no debrief yet → POST /debrief (automatic). If the session was never ended (crash),
the server finalizes it from the last turn's timestamp_end.
```

## 4. System instructions (summary — full text in `src/lib/prompts.ts`)

**Personas**
- *Maya, HR Business Partner*: warm, perceptive, focused on culture fit. Used for HR, and as the second panelist in Situational.
- *Daniel, Senior Staff Engineer*: skeptical and precise; digs into edge cases and tradeoffs. Leads Technical and Coding.
- *Priya, Hiring Manager*: focused on outcomes and pragmatic; probes impact and ownership. Second on Technical/Coding, lead on Situational.

**Panel protocol.** One speaker per turn. Whenever the speaker changes, the new one opens with their name ("Priya here — …"). The client uses this to attribute voice turns.

**Difficulty enforcement**
- EASY: supportive, hints allowed, explicit STAR guidance, at most 1 follow-up.
- MEDIUM: neutral, no hints, probes metrics, alternatives and ownership, 1–2 follow-ups.
- HARD: not agreeable by default, never says "great answer", 2–3 follow-ups. Uses the exact callouts: *"That's vague. Give me a concrete example and measurable impact."*, *"You didn't answer the question. Start with the result, then your actions."*, *"What did YOU do specifically?"* Also pushes on contradictions, edge cases and 10× scale.

The offline interviewer (`local-interviewer.ts`) applies the same rules with simple checks: word count, metrics present, "we" vs "I", result language.

**Follow-up rules.** One question at a time, under 60 words, grounded in the JD, CV and company site. Follow up when an answer is vague, has no metric or shows no ownership. Paced to the planned duration. Never scores out loud.

## 5. Schema enforcement strategy
1. **Generation-time**: `responseMimeType: application/json` plus `responseJsonSchema` (the exact DEBRIEF_JSON shape).
2. **Coercion**: `normalizeDebrief()` rebuilds every key and type, clamps scores to 1–100 when turns ≥ 2, formats timestamps as `mm:ss`, and overwrites session facts (status, durations, company, type, difficulty) with values from the server.
3. **Validation + repair**: `validateDebrief()` checks for 7 plan days, non-empty strengths/improvements/checklist, and scores ≥ 1. On failure it sends one repair prompt listing the errors, then patches whatever is still missing from the heuristic output.
4. **Never fail**: `heuristicDebrief()` builds a fully valid DEBRIEF_JSON from transcript features (fillers, WPM, pauses, STAR signals, metrics, I/we ratio) with real quotes and timestamps. It fills `notes_if_low_data` for short sessions.

Every run is stored as a new `debriefs.version`. "Regenerate" reuses the same stored transcript.

## 6. Environment
| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Enables Live voice (ephemeral tokens) and Gemini debriefs |
| `GEMINI_LIVE_MODEL` | default `gemini-3.1-flash-live-preview` |
| `GEMINI_TEXT_MODEL` | default `gemini-2.5-flash` |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | Switches auth to Firebase (email + Google) |
| `AUTH_SECRET` | Session cookie signing key (derived from `DATABASE_URL` if unset) |
