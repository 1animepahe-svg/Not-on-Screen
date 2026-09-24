import { ReplayView } from "./ReplayView";

export default async function ReplayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  return <ReplayView id={id} initialT={t ? Number(t) || 0 : null} />;
}
