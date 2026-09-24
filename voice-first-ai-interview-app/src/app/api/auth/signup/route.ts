import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSessionCookie, handleError, hashPassword, HttpError, publicUser } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase-config";

export async function POST(req: Request) {
  try {
    if (firebaseEnabled) throw new HttpError(400, "This deployment uses Firebase Auth.");
    const { email, password, name } = (await req.json()) as { email?: string; password?: string; name?: string };
    const e = (email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) throw new HttpError(400, "Enter a valid email address.");
    if (!password || password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, e)).limit(1);
    if (existing) throw new HttpError(409, "An account with this email already exists. Try signing in.");
    const [u] = await db
      .insert(users)
      .values({ email: e, name: (name || "").trim() || e.split("@")[0], passwordHash: hashPassword(password), provider: "password" })
      .returning();
    await createSessionCookie(u.id);
    return Response.json({ user: publicUser(u) });
  } catch (e) {
    return handleError(e);
  }
}
