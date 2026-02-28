import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computeAgentRevenueSummary } from "@/lib/data/dashboard-metrics";
import { AgentsClient } from "./agents-client";
import { mockCustomers } from "@/lib/mock-data";

export const revalidate = 60;

export default async function AgentsPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <AgentsClient customers={mockCustomers} />;
  }

  const customers = await fetchCustomersWithRelations();
  const agentSummary = computeAgentRevenueSummary(customers);
  return <AgentsClient customers={customers} agentSummary={agentSummary} />;
}
