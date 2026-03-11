export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations, fetchFirstPaidDates } from "@/lib/data/customers";
import { fetchSubsidyCompletionData, fetchSubsidyDocuments } from "@/lib/data/subsidy";
import { SubsidyClient } from "./subsidy-client";
import type { CustomerWithRelations } from "@strategy-school/shared-db";

// 補助金対象判定（server-side）
const SUBSIDY_START = "2026-02-10";

function normalizeDate(d: string | null | undefined): string {
  if (!d) return "";
  return d.replace(/\//g, "-").split("T")[0].split(" ")[0];
}

function isShinsotsu(attr: string | null | undefined): boolean {
  return attr === "新卒";
}

function isSubsidyTarget(c: CustomerWithRelations): boolean {
  if (isShinsotsu(c.attribute)) return false;
  const appDate = normalizeDate(c.application_date);
  const salesDate = normalizeDate(c.pipeline?.sales_date);
  if (appDate > SUBSIDY_START) return true;
  if (salesDate > SUBSIDY_START) {
    const stage = c.pipeline?.stage;
    if (stage === "未実施" || stage === "日程未確" || stage === "NoShow") return false;
    return true;
  }
  return false;
}

export default async function SubsidyPage() {
  const [customers, firstPaidMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchFirstPaidDates(),
  ]);

  const subsidyCustomers = customers.filter(isSubsidyTarget);
  const subsidyIds = subsidyCustomers.map((c) => c.id);

  const [completionData, documentData] = await Promise.all([
    fetchSubsidyCompletionData(subsidyIds),
    fetchSubsidyDocuments(subsidyIds),
  ]);

  return (
    <SubsidyClient
      customers={customers}
      firstPaidMap={firstPaidMap}
      completionData={completionData}
      documentData={documentData}
    />
  );
}
