import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { MarketingClient } from "./marketing-client";
import { mockCustomers } from "@/lib/mock-data";

export const revalidate = 60;

export default async function MarketingPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <MarketingClient customers={mockCustomers} />;
  }

  const customers = await fetchCustomersWithRelations();
  return <MarketingClient customers={customers} />;
}
