import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computeSalesPersonClosingRates } from "@/lib/data/dashboard-metrics";
import { SalesRateClient } from "./sales-rate-client";

export async function SalesRateSection() {
  const customers = await fetchCustomersWithRelations();
  const rates = computeSalesPersonClosingRates(customers, 10, 12);

  if (rates.length === 0) return null;

  return <SalesRateClient rates={rates} />;
}
