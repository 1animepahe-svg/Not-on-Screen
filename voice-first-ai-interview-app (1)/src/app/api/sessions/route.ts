import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { interviewSessions } from "@/db/schema";
import { apiUser, handleError, HttpError } from "@/lib/auth";
import { fetchCompanyContext, toDTO } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const u = await apiUser();
    const rows = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, u.id))
      .orderBy(desc(interviewSessions.createdAt))
      .limit(50);
    return Response.json({ sessions: rows.map(toDTO) });
  } catch (e) {
    return handleError(e);
  }
}

const TYPES = ["hr", "technical", "coding", "situational", "custom"];
const DIFFS = ["easy", "medium", "hard"];

export async function POST(req: Request) {
  try {
    const u = await apiUser();
    const b = (await req.json()) as Record<string, unknown>;
    const type = String(b.interviewType);
    const difficulty = String(b.difficulty);
    if (!TYPES.includes(type)) throw new HttpError(400, "Choose an interview type.");
    if (!DIFFS.includes(difficulty)) throw new HttpError(400, "Choose a difficulty.");
    const planned = Math.round(Number(b.plannedMinutes));
    if (!Number.isFinite(planned) || planned < 1 || planned > 240) throw new HttpError(400, "Duration must be 1–240 minutes.");
    let url = String(b.companyUrl || "").trim();
    if (!url) throw new HttpError(400, "Company website link is required.");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
      new URL(url);
    } catch {
      throw new HttpError(400, "Company website link looks invalid.");
    }
    let panel = 1;
    if (type === "technical" || type === "coding") panel = 2;
    if (type === "situational") panel = Number(b.panelSize) === 2 ? 2 : 1;
    if (type === "custom") panel = Number(b.panelSize) === 2 ? 2 : 1;
    const company = await fetchCompanyContext(url);
    const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
    const [row] = await db
      .insert(interviewSessions)
      .values({
        userId: u.id,
        interviewType: type,
        customType: s(b.customType, 500),
        difficulty,
        plannedMinutes: planned,
        panelSize: panel,
        roleTitle: s(b.roleTitle, 120),
        companyUrl: url,
        companyName: s(b.companyName, 80) || company.name,
        companyContext: company.context,
        cvText: s(b.cvText, 30000),
        coverLetterText: s(b.coverLetterText, 15000),
        jdText: s(b.jdText, 30000),
        status: "setup",
      })
      .returning();
    return Response.json({ session: toDTO(row) });
  } catch (e) {
    return handleError(e);
  }
}
