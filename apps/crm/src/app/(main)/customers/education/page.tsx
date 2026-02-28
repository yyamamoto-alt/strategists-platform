import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { EducationClient } from "./education-client";
import { mockCustomers } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function EducationPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <EducationClient customers={mockCustomers} />;
  }

  const customers = await fetchCustomersWithRelations();
  return <EducationClient customers={customers} />;
}
