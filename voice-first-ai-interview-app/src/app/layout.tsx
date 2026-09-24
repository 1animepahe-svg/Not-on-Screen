import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Not on screen — voice-first AI interview practice",
  description: "Rehearse real interviews out loud with a Gemini Live interviewer panel, then get an evidence-based debrief.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="aurora" aria-hidden>
          <div className="blob b1" />
          <div className="blob b2" />
          <div className="blob b3" />
        </div>
        <div className="noise" aria-hidden />
        <ToastProvider>
          <div className="relative z-10">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
