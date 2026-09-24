import { db } from "@/db";
import { uploads } from "@/db/schema";
import { apiUser, handleError, HttpError } from "@/lib/auth";

export const maxDuration = 60;

async function extract(buf: Buffer, mime: string, name: string): Promise<string> {
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text);
  }
  if (mime.startsWith("text/") || /\.(txt|md|markdown|rtf|csv|json)$/.test(lower)) return buf.toString("utf8");
  if (lower.endsWith(".docx")) {
    // Minimal DOCX support: pull text runs from word/document.xml without extra deps.
    const s = buf.toString("latin1");
    const runs = s.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (runs?.length) return runs.map((r) => r.replace(/<[^>]+>/g, "")).join(" ");
    throw new HttpError(415, "Couldn't read this .docx (compressed). Please upload PDF or paste the text.");
  }
  throw new HttpError(415, "Unsupported file. Upload PDF, TXT or MD — or paste the text.");
}

/** Stores the original file (Cloud Storage equivalent) and returns extracted text. */
export async function POST(req: Request) {
  try {
    const u = await apiUser();
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "cv");
    if (!(file instanceof File)) throw new HttpError(400, "No file received.");
    if (file.size > 10 * 1024 * 1024) throw new HttpError(413, "File too large (max 10 MB).");
    const buf = Buffer.from(await file.arrayBuffer());
    const text = (await extract(buf, file.type, file.name)).replace(/\s+\n/g, "\n").trim().slice(0, 30000);
    if (!text) throw new HttpError(422, "No readable text found in this file. Try pasting the text instead.");
    const [row] = await db
      .insert(uploads)
      .values({ userId: u.id, kind, filename: file.name.slice(0, 200), mime: file.type || "application/octet-stream", sizeBytes: file.size, data: buf, extractedText: text })
      .returning({ id: uploads.id });
    return Response.json({ id: row.id, filename: file.name, text });
  } catch (e) {
    return handleError(e);
  }
}
