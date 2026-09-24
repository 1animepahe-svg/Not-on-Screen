import { requireUser } from "@/lib/auth";
import { SetupWizard } from "./SetupWizard";

export default async function SetupPage() {
  const u = await requireUser("/setup");
  return <SetupWizard defaultDifficulty={u.settings?.defaultDifficulty ?? "medium"} defaultType={u.settings?.defaultType ?? "hr"} />;
}
