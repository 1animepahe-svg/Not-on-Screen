import { getCurrentUser, publicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  return Response.json({ user: u ? publicUser(u) : null });
}
