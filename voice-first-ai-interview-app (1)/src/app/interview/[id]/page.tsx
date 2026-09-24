import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnedSession, toDTO } from "@/lib/sessions";
import { getPersonas } from "@/lib/types";
import { InterviewRoom } from "./InterviewRoom";

export const dynamic = "force-dynamic";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/interview/${id}`);
  const s = await getOwnedSession(id, user.id).catch(() => null);
  if (!s) notFound();
  if (s.endedAt) redirect(`/debrief/${id}`);
  const dto = toDTO(s);
  return (
    <InterviewRoom
      session={dto}
      personas={getPersonas(dto.interviewType, dto.panelSize)}
      settings={{
        recordAudio: user.settings?.recordAudio ?? true,
        readAloudFallback: user.settings?.readAloudFallback ?? true,
        captions: user.settings?.captions ?? true,
        handsFreeDefault: user.settings?.handsFreeDefault ?? true,
      }}
    />
  );
}
