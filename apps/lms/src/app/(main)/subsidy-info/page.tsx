import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { SubsidyInfoClient } from "./subsidy-info-client";

export const dynamic = "force-dynamic";

export interface SubsidyProgress {
  // 条件1: ケース面接指導4回以上
  caseSessionCount: number;
  caseRequired: number;
  caseMet: boolean;
  // 条件2: ビヘイビア指導1回以上
  behaviorSessionCount: number;
  behaviorRequired: number;
  behaviorMet: boolean;
  // 条件3: 教材アウトプットフォーム提出
  hasOutputForm: boolean;
  outputFormDate: string | null;
}

const ADMIN_PREVIEW_EMAIL = "erika.ohbayashi@gmail.com";

export default async function SubsidyInfoPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
  if (useMock) {
    return <SubsidyInfoClient progress={null} />;
  }

  const session = await getLmsSession();
  if (!session?.user) {
    return <SubsidyInfoClient progress={null} />;
  }

  const isAdmin = session.role === "admin" || session.role === "mentor";
  const targetEmail = isAdmin ? ADMIN_PREVIEW_EMAIL : session.user.email;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  // 顧客IDを取得
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("email", targetEmail)
    .maybeSingle() as { data: { id: string } | null };

  if (!customer) {
    return <SubsidyInfoClient progress={null} />;
  }

  const customerId = customer.id;

  // メンター指導報告 + 教材アウトプットを並列取得
  const [mentorReportsResult, outputFormResult] = await Promise.all([
    db
      .from("application_history")
      .select("raw_data")
      .eq("customer_id", customerId)
      .eq("source", "メンター指導報告")
      .order("applied_at", { ascending: true }),
    db
      .from("application_history")
      .select("raw_data, applied_at")
      .eq("customer_id", customerId)
      .eq("source", "教材アウトプット")
      .limit(1),
  ]);

  const mentorReports = (mentorReportsResult.data || []) as { raw_data: Record<string, string> }[];
  const outputForms = (outputFormResult.data || []) as { raw_data: Record<string, string>; applied_at: string }[];

  // ケース指導・ビヘイビア指導のカウント
  let caseSessionCount = 0;
  let behaviorSessionCount = 0;

  for (const h of mentorReports) {
    const rd = h.raw_data || {};
    const kaiji = rd["回次（合計指導回数）"] || "";

    if (typeof kaiji === "string" && kaiji.includes("ビヘイビア")) {
      behaviorSessionCount++;
    } else if (typeof kaiji === "string" && kaiji === "追加指導") {
      // 追加指導はカウント対象外
    } else {
      const isAssessment = typeof kaiji === "string" && kaiji.includes("アセスメント");
      const num = parseInt(String(kaiji), 10);
      if (isAssessment || (!isNaN(num) && num > 0)) {
        caseSessionCount++;
      }
    }
  }

  // 教材アウトプット
  const hasOutputForm = outputForms.length > 0;
  const outputFormDate = hasOutputForm
    ? outputForms[0].raw_data?.["タイムスタンプ"] || outputForms[0].applied_at || null
    : null;

  const progress: SubsidyProgress = {
    caseSessionCount,
    caseRequired: 4,
    caseMet: caseSessionCount >= 4,
    behaviorSessionCount,
    behaviorRequired: 1,
    behaviorMet: behaviorSessionCount >= 1,
    hasOutputForm,
    outputFormDate,
  };

  return <SubsidyInfoClient progress={progress} />;
}
