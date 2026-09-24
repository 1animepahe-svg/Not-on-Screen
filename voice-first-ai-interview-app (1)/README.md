# Not on screen

A premium, minimal-luxury **voice-first AI interview prep** app. Practice real interviews out loud with a low-latency Gemini Live interviewer panel tuned to your CV, job description and target company — then get a rigorous debrief built entirely from your structured transcript.

> Built for **practice, not live interviews**. You rehearse privately so the real conversation needs no help at all.

## Features

- **Real-time voice** — Gemini Live API: your mic streams in, spoken answers stream out, with natural barge-in (interrupting the interviewer stops their audio instantly).
- **Error-resistant connection state machine** — `idle → connecting → connected → reconnecting → error → fallback`:
  - non-blocking toasts + automatic reconnect, **max 2 retries** (Live session resumable via `sessionResumption` handle)
  - after that it falls back to **text mode with the same session alive** — transcript logging continues and the debrief is still generated
  - clear user-facing errors: mic blocked / no mic / mic busy / offline / permission
- **Early end always works** — duration is only a *planned* limit. End after 2 minutes and you still get a **PARTIAL SESSION DEBRIEF**.
- **Interview modes** — HR, Technical, Coding, Situational/Behavioral, Custom · Easy/Medium/Hard · 30/60/120 min + custom · CV & cover letter upload, JD paste/upload, required company website (auto-scraped for context).
- **Interviewer panels** — HR → 1 interviewer · Technical/Coding → 2 distinct panelists · Situational → 1–2 toggle.
- **Difficulty that feels different**
  - **Easy** — supportive, hints allowed, guided toward STAR
  - **Medium** — neutral, professional, probes metrics and tradeoffs
  - **Hard** — strict, skeptical, blunt-but-professional. Not agreeable by default. Calls out weak answers:
    - *“That’s vague. Give me a concrete example and measurable impact.”*
    - *“You didn’t answer the question. Start with the result, then your actions.”*
    - *“What did YOU do specifically?”*
  - more follow-ups, edge cases, contradictions, tradeoff grilling
- **Non-negotiable transcript** — every turn is logged as `{speaker, timestamp_start, timestamp_end, text}`, even in text fallback. The debrief is generated **from the transcript, never from “memory”**.
- **Reliable debrief pipeline** — strict `DEBRIEF_JSON` schema (JSON mode + JSON schema → normalize → validate → one repair retry → heuristic fallback). “Regenerate Debrief” re-runs on the **same** transcript and is versioned. Scoring rules: ≥2 turns ⇒ scores always 1–100; short sessions still get scored with a `notes_if_low_data` note.
- **Session replay** — transcript timeline with jump-to, bookmarks, and recorded audio playback (both sides, when the browser supports mixing).
- **UX** — push-to-talk (hold Space) or hands-free, live captions, notes/bookmark drawer, waveform, speaking-ring avatars, score-reveal animations. 1100px max-width, 12-col grid, glass cards, subtle aurora + noise background, one emerald accent.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) · Tailwind CSS · Framer Motion · lucide-react |
| Real-time AI | Gemini Live API — ephemeral, single-use tokens minted server-side (the API key never reaches the browser) |
| Debrief AI | Gemini text model, JSON mode + JSON schema enforcement |
| Auth | **Firebase Auth** (email/password, optional Google, password reset) when configured; otherwise built-in scrypt + signed-cookie auth so it always works |
| Database | PostgreSQL + Drizzle ORM — tables map 1:1 to Firestore collections (`users`, `interview_sessions`, `transcript_turns`, `debriefs`, `bookmarks`); `uploads` and `recordings` blob tables map to Cloud Storage objects (`users/{uid}/sessions/{sid}/…`) |
| AI fallback | Deterministic local interviewer + local heuristic debrief analyzer (no key / no network) |

## Quickstart (local)

```bash
git clone <your-repo-url> not-on-screen
cd not-on-screen

npm install
cp .env.example .env          # then fill in the values below

# create the tables (Postgres must be reachable)
npx drizzle-kit push

npm run dev                   # http://localhost:3000
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (e.g. Neon, Supabase, local Postgres) |
| `GEMINI_API_KEY` | recommended | Enables real-time voice (Live API) + Gemini debriefs. Without it: text-mode interview with the local interviewer + heuristic debrief |
| `GEMINI_LIVE_MODEL` | no | Default `gemini-3.1-flash-live-preview` |
| `GEMINI_TEXT_MODEL` | no | Default `gemini-2.5-flash` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | optional | Switches sign-in to Firebase Auth |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | optional | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | optional | Firebase project (used for ID-token verification server-side) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | optional | Firebase web app ID |
| `AUTH_SECRET` | no | Session cookie signing key (auto-derived from `DATABASE_URL` if unset) |

## How it holds up under failure

```
Live voice
  token (ephemeral, 1 use) → WebSocket (client ↔ Gemini Live)
  mic: AudioWorklet → 16 kHz PCM16 chunks
  TTS: gapless 24 kHz queue; interruption = stop() all queued sources

on FAIL (retries < 2)  → reconnecting (resume handle, or re-send transcript recap)
on FAIL (retries ≥ 2)  → error → fallback text (session + transcript survive)
on FATAL (mic blocked, no key, 401) → fallback text immediately
"Try voice again"      → fresh connect, retries reset

Transcript: finalized turns flushed every 3 s to an idempotent upsert
            (keyed by client id) + sendBeacon on tab close.

Debrief: transcript (only) → DEBRIEF_JSON → validate/repair → heuristic fallback
         → saved as a new version → rendered.
```

## API surface

| Route | Purpose |
|---|---|
| `POST /api/auth/signup · signin · forgot · reset · signout` | built-in auth (active when Firebase keys are absent) |
| `POST /api/auth/firebase` | exchange a Firebase ID token (verified via Google JWKS) for a session cookie |
| `GET/POST /api/sessions` | list / create (fetches company website context on create) |
| `GET/PATCH/DELETE /api/sessions/[id]` | full session (turns, bookmarks, debrief) · `start` / `mode` / `end` · delete |
| `POST /api/sessions/[id]/turns` | idempotent batch transcript upsert |
| `POST /api/sessions/[id]/bookmarks` | add bookmark at timestamp |
| `POST /api/sessions/[id]/debrief` | generate / regenerate DEBRIEF_JSON from stored transcript |
| `POST/GET /api/sessions/[id]/audio` | upload / stream session recording |
| `POST /api/live/token` | mint ephemeral Gemini Live token + session config |
| `POST /api/interview/reply` | fallback_text interviewer turn (Gemini JSON mode, then local interviewer) |
| `POST /api/uploads` | store file + extract text (PDF/TXT/MD/DOCX) |
| `GET/PATCH /api/settings` | profile + interview defaults |

## Deploying

GitHub hosts the **code**; the app itself needs a server for API routes, so deploy to **Vercel** (GitHub Pages can only serve static files):

1. Push this repo to GitHub.
2. Create a Postgres database (Neon / Supabase / RDS).
3. In Vercel: *Import Project* → select the repo.
4. Add env vars: `DATABASE_URL`, `GEMINI_API_KEY`, optional `NEXT_PUBLIC_FIREBASE_*` and `AUTH_SECRET`.
5. Apply the schema once (from anywhere with DB access): `npx drizzle-kit push`.
6. Deploy.

The included GitHub Actions workflow (`.github/workflows/ci.yml`) runs `tsc --noEmit` and `next build` on every push/PR.

## Project layout

Full build plan, pseudocode (mic streaming, interruption, transcript logging, end-of-session finalization, retry/fallback), the interviewer system instructions and the schema-enforcement strategy are documented in [`BLUEPRINT.md`](./BLUEPRINT.md).

```
src/
  app/            # Landing, Auth, Dashboard, Setup wizard, Interview room,
                  # Debrief, Replay, Settings + all API routes
  lib/
    live/         # machine.ts (state machine), audio.ts (mic/playback/recording),
                  # useInterviewEngine.ts (orchestration)
    prompts.ts    # personas, difficulty rules, follow-up rules, debrief prompt
    debrief.ts    # DEBRIEF_JSON schema, validation/repair, heuristic fallback
    local-interviewer.ts  # offline interviewer that still enforces difficulty
  components/     # glass UI kit, toasts, waveform, speaking-ring avatars, score rings
```

## License

[MIT](./LICENSE)
