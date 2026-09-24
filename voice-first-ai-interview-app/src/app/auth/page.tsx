import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "./AuthForm";

export const dynamic = "force-dynamic";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/dashboard";
  if (await getCurrentUser()) redirect(next);
  const mode = sp.mode === "signup" ? "signup" : sp.mode === "forgot" ? "forgot" : "signin";
  return <AuthForm initialMode={mode} next={next} />;
}
