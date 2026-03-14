import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CaseDbClient } from "./case-db-client";

export const dynamic = "force-dynamic";

export default async function CaseDbPage() {
  const session = await getLmsSession();
  if (!session) redirect("/login");

  const supabase = createAdminClient();
  const { data: problems } = await supabase
    .from("case_problems")
    .select("id, company, no, tags, question, is_public")
    .order("company")
    .order("no");

  return <CaseDbClient problems={problems || []} />;
}
