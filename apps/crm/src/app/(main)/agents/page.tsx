export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computeAgentRevenueSummary } from "@/lib/data/dashboard-metrics";
import { AgentsClient } from "./agents-client";

export const revalidate = 60;

export default async function AgentsPage() {
  const customers = await fetchCustomersWithRelations();
  const agentSummary = computeAgentRevenueSummary(customers);
  return <AgentsClient customers={customers} agentSummary={agentSummary} />;
}
