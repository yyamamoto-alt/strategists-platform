export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations, fetchFirstPaidDates } from "@/lib/data/customers";
import { SubsidyClient } from "./subsidy-client";

export default async function SubsidyPage() {
  const [customers, firstPaidMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchFirstPaidDates(),
  ]);
  return <SubsidyClient customers={customers} firstPaidMap={firstPaidMap} />;
}
