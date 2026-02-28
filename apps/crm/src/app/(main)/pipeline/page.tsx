import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { PipelineClient } from "./pipeline-client";
import { mockCustomers } from "@/lib/mock-data";

export const revalidate = 60;

export default async function PipelinePage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <PipelineClient customers={mockCustomers} />;
  }

  const customers = await fetchCustomersWithRelations();
  return <PipelineClient customers={customers} />;
}
