import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { LearningClient } from "./learning-client";
import { mockCustomers } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <LearningClient customers={mockCustomers} />;
  }

  const customers = await fetchCustomersWithRelations();
  return <LearningClient customers={customers} />;
}
