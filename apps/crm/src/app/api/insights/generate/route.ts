import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetrics,
  computeThreeTierRevenue,
  computeChannelMetrics,
  computeAgentRevenueSummary,
} from "@/lib/data/dashboard-metrics";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";

export const dynamic = "force-dynamic";

const CATEGORIES = ["marketing", "sales"] as const;

const CATEGORY_PROMPTS: Record<string, string> = {
  marketing: `あなたはマーケティング戦略の専門家です。以下のデータを分析し、マーケティングに関する経営示唆を2つ、日本語で提供してください。

【重要な分析方針】
- 直近1ヶ月のデータを最優先で分析し、その前6ヶ月間との変化・トレンドを比較してください
- 「直近1ヶ月」と「前月比」「半年平均比」を明示してください
- チャネル別のCPA効率や申込トレンドの変化に注目してください

フォーマット: 各示唆を「■」で始め、太字タイトル（15字以内）→ 具体的数値を含む説明（2行以内）。簡潔に。`,

  sales: `あなたは営業戦略の専門家です。以下のデータを分析し、営業プロセスに関する経営示唆を2つ、日本語で提供してください。

【重要な分析方針】
- 直近1ヶ月のデータを最優先で分析し、その前6ヶ月間との変化・トレンドを比較してください
- 「直近1ヶ月」と「前月比」「半年平均比」を明示してください
- ファネル転換率（実施→成約）、日程確定率の変化に注目してください

フォーマット: 各示唆を「■」で始め、太字タイトル（15字以内）→ 具体的数値を含む説明（2行以内）。簡潔に。`,
};

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません" },
      { status: 500 }
    );
  }

  try {
    const [customers, attributions] = await Promise.all([
      fetchCustomersWithRelations(),
      fetchChannelAttributions(),
    ]);

    const attributionMap: Record<string, (typeof attributions)[number]> = {};
    for (const attr of attributions) {
      attributionMap[attr.customer_id] = attr;
    }

    const funnelMetrics = computeFunnelMetrics(customers);
    const threeTierRevenue = computeThreeTierRevenue(customers);
    const channelMetrics = computeChannelMetrics(customers, attributionMap);
    const agentSummary = computeAgentRevenueSummary(customers);

    // 直近1ヶ月 vs 前6ヶ月の比較データを重視
    const latestMonth = funnelMetrics.slice(-1);
    const previousMonth = funnelMetrics.slice(-2, -1);
    const last6Months = funnelMetrics.slice(-7, -1);
    const latestRevenue = threeTierRevenue.slice(-1);
    const prev6Revenue = threeTierRevenue.slice(-7, -1);

    const dataSnapshot = {
      latest_month: {
        funnel: latestMonth[0] || null,
        revenue: latestRevenue[0] || null,
      },
      previous_month: {
        funnel: previousMonth[0] || null,
      },
      last_6months_avg: {
        applications: last6Months.length > 0 ? Math.round(last6Months.reduce((s, f) => s + f.applications, 0) / last6Months.length) : 0,
        conducted: last6Months.length > 0 ? Math.round(last6Months.reduce((s, f) => s + f.conducted, 0) / last6Months.length) : 0,
        closed: last6Months.length > 0 ? Math.round(last6Months.reduce((s, f) => s + f.closed, 0) / last6Months.length) : 0,
        avg_closing_rate: last6Months.length > 0 ? (last6Months.reduce((s, f) => s + f.closing_rate, 0) / last6Months.length) : 0,
        avg_confirmed_revenue: prev6Revenue.length > 0 ? Math.round(prev6Revenue.reduce((s, r) => s + r.confirmed_total, 0) / prev6Revenue.length) : 0,
      },
      channel_metrics_top5: channelMetrics.slice(0, 5),
      agent_summary: {
        total_confirmed: agentSummary.total_confirmed_fee,
        total_projected: agentSummary.total_projected_fee,
      },
    };

    const dataText = JSON.stringify(dataSnapshot, null, 2);

    const anthropic = new Anthropic({ apiKey });
    const supabase = createServiceClient();

    const results: { category: string; content: string }[] = [];

    for (const category of CATEGORIES) {
      const prompt = CATEGORY_PROMPTS[category];

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\n## データ\n\`\`\`json\n${dataText}\n\`\`\``,
          },
        ],
      });

      const content =
        message.content[0].type === "text" ? message.content[0].text : "";

      results.push({ category, content });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      await db.from("ai_insights").insert({
        category,
        content,
        data_snapshot: dataSnapshot,
      });
    }

    return NextResponse.json({
      success: true,
      insights: results,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("AI insights generation failed:", error);
    return NextResponse.json(
      {
        error: "AI示唆の生成に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
