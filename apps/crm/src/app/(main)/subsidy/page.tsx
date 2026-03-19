export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations, fetchFirstPaidDates } from "@/lib/data/customers";
import { fetchSubsidyCompletionData, fetchSubsidyDocuments, fetchSubsidyChecks, fetchCoachingMentors } from "@/lib/data/subsidy";
import { SubsidyClient } from "./subsidy-client";
import type { CustomerWithRelations } from "@strategy-school/shared-db";

/** テスト顧客判定: 名前に「テスト」を含む */
function isTestCustomer(c: CustomerWithRelations): boolean {
  const name = c.name || "";
  return name.includes("テスト");
}

/** 補助金対象判定: contracts.subsidy_eligible=true かつ 成約済み */
function isSubsidyTarget(c: CustomerWithRelations): boolean {
  if (isTestCustomer(c)) return false;
  if (!c.contract?.subsidy_eligible) return false;
  if (c.pipeline?.stage !== "成約") return false;
  return true;
}

export default async function SubsidyPage() {
  const [customers, firstPaidMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchFirstPaidDates(),
  ]);

  const subsidyCustomers = customers.filter(isSubsidyTarget);
  const subsidyIds = subsidyCustomers.map((c) => c.id);

  const [completionData, documentData, checksData, coachingMentors] = await Promise.all([
    fetchSubsidyCompletionData(subsidyIds),
    fetchSubsidyDocuments(subsidyIds),
    fetchSubsidyChecks(subsidyIds),
    fetchCoachingMentors(subsidyIds),
  ]);

  return (
    <SubsidyClient
      customers={customers}
      firstPaidMap={firstPaidMap}
      completionData={completionData}
      documentData={documentData}
      checksData={checksData}
      coachingMentors={coachingMentors}
    />
  );
}
