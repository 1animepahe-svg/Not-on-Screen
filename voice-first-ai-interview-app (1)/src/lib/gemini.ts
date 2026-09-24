import { GoogleGenAI } from "@google/genai";

export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";
export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";

export function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI | null {
  const key = geminiKey();
  if (!key) return null;
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Calls Gemini with JSON-mode + JSON schema. Returns parsed JSON or throws. */
export async function generateJSON(opts: {
  system: string;
  prompt: string;
  schema: unknown;
  temperature?: number;
  timeoutMs?: number;
}): Promise<unknown> {
  const ai = gemini();
  if (!ai) throw new Error("GEMINI_API_KEY not configured");
  const res = await withTimeout(
    ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        temperature: opts.temperature ?? 0.4,
      },
    }),
    opts.timeoutMs ?? 60000
  );
  const text = res.text ?? "";
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}
