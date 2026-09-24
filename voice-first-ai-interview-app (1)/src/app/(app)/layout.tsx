import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <AppHeader name={user.name || user.email} />
      <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-8">{children}</main>
    </>
  );
}
