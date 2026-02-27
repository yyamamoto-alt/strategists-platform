import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { AgentsClient } from "./agents-client";
import { mockCustomers } from "@/lib/mock-data";

export default async function AgentsPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <AgentsClient customers={mockCustomers} />;
  }

  const customers = await fetchCustomersWithRelations();
  return <AgentsClient customers={customers} />;
}
