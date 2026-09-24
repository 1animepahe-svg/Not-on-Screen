import { apiUser, handleError } from "@/lib/auth";
import { generateJSON, geminiKey } from "@/lib/gemini";
import { localInterviewerReply } from "@/lib/local-interviewer";
import { buildSystemInstruction } from "@/lib/prompts";
import { getOwnedSession, sanitizeTurns, toContext } from "@/lib/sessions";
import { fmtTs, getPersonas, type Difficulty, type InterviewType } from "@/lib/types";

export const maxDuration = 60;

/** fallback_text interviewer: continues the SAME interview from the transcript. Never errors to the UI. */
export async function POST(req: Request) {
  try {
    const u = await apiUser();
    const body = (await req.json()) as { sessionId?: string; turns?: unknown; wrapUp?: boolean };
    const s = await getOwnedSession(String(body.sessionId), u.id);
    const turns = sanitizeTurns(body.turns).filter((t) => t.speaker !== "system");
    const personas = getPersonas(s.interviewType as InterviewType, s.panelSize);

    if (geminiKey()) {
      try {
        const transcript = turns
          .slice(-40)
          .map((t) => `[${fmtTs(t.tsStartMs)}] ${t.speaker === "candidate" ? "CANDIDATE" : (t.speakerName || t.speaker).toUpperCase()}: ${t.text}`)
          .join("\n");
        const raw = (await generateJSON({
          system: buildSystemInstruction(toContext(s), "text"),
          prompt: `Transcript so far:\n${transcript || "(none — open the interview)"}\n\n${
            body.wrapUp ? "The planned time is up: wrap up politely in 1–2 sentences and invite a final question." : "Produce the NEXT interviewer turn only."
          } Return JSON {speaker, text}. speaker must be one of: ${personas.map((p) => `"${p.key}" (${p.name})`).join(", ")}.`,
          schema: {
            type: "object",
            properties: { speaker: { type: "string", enum: personas.map((p) => p.key) }, text: { type: "string" } },
            required: ["speaker", "text"],
          },
          temperature: 0.8,
          timeoutMs: 25000,
        })) as { speaker?: string; text?: string };
        const p = personas.find((x) => x.key === raw.speaker) ?? personas[0];
        if (raw.text && raw.text.trim()) {
          return Response.json({ reply: { speaker: p.key, speakerName: p.name, text: raw.text.trim() }, source: "gemini" });
        }
      } catch (e) {
        console.error("text reply gemini failed; using local interviewer", e);
      }
    }
    const reply = localInterviewerReply({
      type: s.interviewType as InterviewType,
      difficulty: s.difficulty as Difficulty,
      panelSize: s.panelSize,
      companyName: s.companyName,
      turns,
    });
    if (body.wrapUp) reply.text = "We're at time. Thanks for your answers today — anything you'd like to ask before we close?";
    return Response.json({ reply, source: "local" });
  } catch (e) {
    return handleError(e);
  }
}
