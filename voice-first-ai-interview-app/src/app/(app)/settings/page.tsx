import { requireUser } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase-config";
import { geminiKey, LIVE_MODEL, TEXT_MODEL } from "@/lib/gemini";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const u = await requireUser("/settings");
  return (
    <SettingsForm
      initial={{ name: u.name, email: u.email, provider: u.provider, settings: u.settings ?? {} }}
      status={{ firebase: firebaseEnabled, gemini: Boolean(geminiKey()), liveModel: LIVE_MODEL, textModel: TEXT_MODEL }}
    />
  );
}
