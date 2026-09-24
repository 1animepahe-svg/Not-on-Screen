import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type UserSettings } from "@/db/schema";
import { apiUser, handleError, publicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const u = await apiUser();
    return Response.json({ user: publicUser(u) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const u = await apiUser();
    const b = (await req.json()) as { name?: string; settings?: UserSettings };
    const s = b.settings ?? {};
    const settings: UserSettings = {
      ...u.settings,
      ...(s.defaultDifficulty && ["easy", "medium", "hard"].includes(s.defaultDifficulty) ? { defaultDifficulty: s.defaultDifficulty } : {}),
      ...(typeof s.defaultType === "string" ? { defaultType: s.defaultType } : {}),
      ...(typeof s.recordAudio === "boolean" ? { recordAudio: s.recordAudio } : {}),
      ...(typeof s.readAloudFallback === "boolean" ? { readAloudFallback: s.readAloudFallback } : {}),
      ...(typeof s.captions === "boolean" ? { captions: s.captions } : {}),
      ...(typeof s.handsFreeDefault === "boolean" ? { handsFreeDefault: s.handsFreeDefault } : {}),
      ...(typeof s.voiceName === "string" ? { voiceName: s.voiceName.slice(0, 20) } : {}),
    };
    const [r] = await db
      .update(users)
      .set({ settings, ...(typeof b.name === "string" && b.name.trim() ? { name: b.name.trim().slice(0, 80) } : {}) })
      .where(eq(users.id, u.id))
      .returning();
    return Response.json({ user: publicUser(r) });
  } catch (e) {
    return handleError(e);
  }
}
