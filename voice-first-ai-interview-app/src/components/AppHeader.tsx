"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { Logo } from "./Logo";
import { signOutEverywhere } from "@/lib/firebase-client";

export function AppHeader({ name }: { name: string }) {
  const path = usePathname();
  const router = useRouter();
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/setup", label: "New interview" },
  ];
  return (
    <header className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6">
      <Logo href="/dashboard" />
      <nav className="flex items-center gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${path.startsWith(l.href) ? "bg-white/[0.07] text-white" : "text-white/60 hover:text-white"}`}
          >
            {l.label}
          </Link>
        ))}
        <Link href="/settings" className={`ml-1 rounded-full p-2 transition-colors ${path.startsWith("/settings") ? "bg-white/[0.07] text-white" : "text-white/55 hover:text-white"}`} aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Link>
        <span className="mx-2 hidden h-5 w-px bg-white/10 sm:block" />
        <span className="hidden text-sm text-white/50 sm:block">{name}</span>
        <button
          onClick={async () => {
            await signOutEverywhere();
            router.push("/");
            router.refresh();
          }}
          className="ml-1 rounded-full p-2 text-white/55 transition-colors hover:text-white"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </nav>
    </header>
  );
}
