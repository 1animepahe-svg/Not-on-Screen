import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSessionCookie, handleError, HttpError, publicUser, verifyPassword } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase-config";

export async function POST(req: Request) {
  try {
    if (firebaseEnabled) throw new HttpError(400, "This deployment uses Firebase Auth.");
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    const e = (email || "").trim().toLowerCase();
    const [u] = await db.select().from(users).where(eq(users.email, e)).limit(1);
    if (!u || !verifyPassword(password || "", u.passwordHash)) throw new HttpError(401, "Incorrect email or password.");
    await createSessionCookie(u.id);
    return Response.json({ user: publicUser(u) });
  } catch (e) {
    return handleError(e);
  }
}
