import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { CustomersClient } from "./customers-client";
import { mockCustomers } from "@/lib/mock-data";

export const revalidate = 60;

export default async function CustomersPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <CustomersClient customers={mockCustomers} />;
  }

  const customers = await fetchCustomersWithRelations();
  return <CustomersClient customers={customers} />;
}
