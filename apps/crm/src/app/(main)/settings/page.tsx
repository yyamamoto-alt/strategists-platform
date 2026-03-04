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

  return <SettingsClient settings={settings || []} />;
}
