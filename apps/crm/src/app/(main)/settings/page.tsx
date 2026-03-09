import { createServiceClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: settings } = await db
    .from("app_settings")
    .select("*")
    .order("key");

  const allSettings = settings || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findSetting = (key: string) => allSettings.find((s: any) => s.key === key)?.value;
  const freeeConnected = findSetting("freee_connected") === "true";
  const freeeCompanyName = findSetting("freee_company_name") || "";

  return (
    <SettingsClient
      settings={allSettings}
      freeeConnected={freeeConnected}
      freeeCompanyName={freeeCompanyName as string}
    />
  );
}
