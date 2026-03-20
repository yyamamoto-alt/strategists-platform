import { NextResponse } from "next/server";
import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";

// GET /api/announcements — アクティブなお知らせ取得（ログインユーザー用、プラン別フィルタ）
export async function GET() {
  const session = await getLmsSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createLmsServerClient();

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, content, priority, published_at, target_plan_ids")
    .eq("is_active", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("announcements public GET error:", error);
    return NextResponse.json({ error: "データの取得に失敗しました" }, { status: 500 });
  }

  // ユーザーのプランIDを取得してフィルタリング
  let planId: string | null = null;
  if (session.customerId) {
    const [contractRes, plansRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("plan_name")
        .eq("customer_id", session.customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("plans").select("id, name").eq("is_active", true),
    ]);

    const planName = (contractRes.data as any)?.plan_name;
    const plans = (plansRes.data as any[]) || [];
    if (planName) {
      const matched = plans.find(
        (p) => planName.includes(p.name) || p.name.includes(planName)
      );
      if (matched) planId = matched.id;
    }
  }

  // target_plan_ids が空 = 全員向け、設定あり = 該当プランのみ
  const isAdmin = session.role === "admin" || session.role === "mentor";
  const filtered = isAdmin
    ? data
    : (data || []).filter((a: any) => {
        const targets = a.target_plan_ids || [];
        return targets.length === 0 || (planId && targets.includes(planId));
      });

  return NextResponse.json(filtered);
}
