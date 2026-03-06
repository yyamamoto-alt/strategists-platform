export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { SubsidyClient } from "./subsidy-client";

export default async function SubsidyPage() {
  const customers = await fetchCustomersWithRelations();
  return <SubsidyClient customers={customers} />;
}
