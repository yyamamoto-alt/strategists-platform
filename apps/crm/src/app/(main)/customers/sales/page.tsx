export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { SalesClient } from "./sales-client";

export const revalidate = 60;

export default async function SalesPage() {
  const customers = await fetchCustomersWithRelations();
  return <SalesClient customers={customers} />;
}
