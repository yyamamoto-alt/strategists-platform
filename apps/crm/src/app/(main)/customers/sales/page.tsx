import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { SalesClient } from "./sales-client";
import { mockCustomers } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <SalesClient customers={mockCustomers} />;
  }

  const customers = await fetchCustomersWithRelations();
  return <SalesClient customers={customers} />;
}
