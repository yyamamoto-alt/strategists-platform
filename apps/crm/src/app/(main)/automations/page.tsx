import { fetchAutomations, fetchAutomationLogs } from "@/lib/data/automations";
import { AutomationsClient } from "./automations-client";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const [automations, logs] = await Promise.all([
    fetchAutomations(),
    fetchAutomationLogs(),
  ]);

  return (
    <AutomationsClient
      initialAutomations={automations}
      initialLogs={logs}
    />
  );
}
