import { DebriefView } from "./DebriefView";

export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DebriefView id={id} />;
}
