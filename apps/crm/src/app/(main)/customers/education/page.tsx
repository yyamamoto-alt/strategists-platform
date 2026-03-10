export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { EducationClient } from "./education-client";

export const revalidate = 60;

export default async function EducationPage() {
  const customers = await fetchCustomersWithRelations();
  return <EducationClient customers={customers} />;
}
