import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { AnnouncementsClient } from "./announcements-client";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
  if (useMock) {
    return <AnnouncementsClient announcements={[]} />;
  }

  const session = await getLmsSession();
  if (!session) {
    return <AnnouncementsClient announcements={[]} />;
  }

  const supabase = createAdminClient();

  // お知らせ取得とプラン情報を並列取得
  const isAdmin = session.role === "admin" || session.role === "mentor";

  const announcementsPromise = supabase
    .from("announcements")
    .select("id, title, content, priority, published_at, target_plan_ids")
    .eq("is_active", true)
    .order("published_at", { ascending: false });

  const planPromise = !isAdmin && session.customerId
    ? Promise.all([
        supabase
          .from("contracts")
          .select("plan_name")
          .eq("customer_id", session.customerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("plans").select("id, name").eq("is_active", true),
      ])
    : null;

  const [announcementsResult, planResult] = await Promise.all([
    announcementsPromise,
    planPromise,
  ]);

  const data = announcementsResult.data || [];

  // プランIDでフィルタリング
  let planId: string | null = null;
  if (planResult) {
    const [contractRes, plansRes] = planResult;
    const planName = (contractRes.data as any)?.plan_name;
    const plans = (plansRes.data as any[]) || [];
    if (planName) {
      const matched = plans.find(
        (p: any) => planName.includes(p.name) || p.name.includes(planName)
      );
      if (matched) planId = matched.id;
    }
  }

  const filtered = isAdmin
    ? data
    : data.filter((a: any) => {
        const targets = a.target_plan_ids || [];
        return targets.length === 0 || (planId && targets.includes(planId));
      });

  return <AnnouncementsClient announcements={filtered as any} />;
}
