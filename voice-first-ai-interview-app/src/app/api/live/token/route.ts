import { Modality } from "@google/genai";
import { apiUser, handleError } from "@/lib/auth";
import { gemini, LIVE_MODEL } from "@/lib/gemini";
import { buildSystemInstruction } from "@/lib/prompts";
import { getOwnedSession, toContext } from "@/lib/sessions";

export const dynamic = "force-dynamic";

const VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"];

/**
 * Mints a short-lived, single-use ephemeral token so the browser can stream
 * directly to the Gemini Live API without ever seeing GEMINI_API_KEY.
 */
export async function POST(req: Request) {
  try {
    const u = await apiUser();
    const { sessionId } = (await req.json()) as { sessionId?: string };
    const s = await getOwnedSession(String(sessionId), u.id);
    const ai = gemini();
    if (!ai) {
      return Response.json(
        { error: "Voice is unavailable: GEMINI_API_KEY is not configured. Continuing in text mode.", code: "NO_KEY" },
        { status: 503 }
      );
    }
    const voiceName = VOICES.includes(String(u.settings?.voiceName)) ? String(u.settings.voiceName) : s.interviewType === "hr" ? "Aoede" : "Charon";
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
      },
    });
    const config = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: buildSystemInstruction(toContext(s), "voice"),
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      contextWindowCompression: { slidingWindow: {} },
    };
    return Response.json({ token: token.name, model: LIVE_MODEL, config });
  } catch (e) {
    console.error("live token error", e);
    if (e instanceof Error && !("status" in e)) {
      return Response.json({ error: "Could not start a voice session (token error).", code: "TOKEN_FAILED" }, { status: 502 });
    }
    return handleError(e);
  }
}
