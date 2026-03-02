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

const CATEGORIES = ["marketing", "management", "sales"] as const;

const CATEGORY_PROMPTS: Record<string, string> = {
  marketing: `あなたはマーケティング戦略の専門家です。以下のデータを分析し、マーケティングに関する経営示唆を3〜5つ、日本語で提供してください。
各示唆は具体的な数値に基づき、実行可能なアクションを含めてください。
フォーマット: 各示唆を「■」で始め、太字のタイトル → 説明（2-3行）の形式で記載してください。`,

  management: `あなたは経営コンサルタントです。以下のデータを分析し、全体的な経営・財務に関する示唆を3〜5つ、日本語で提供してください。
売上構成、成長トレンド、リスク要因に焦点を当ててください。
フォーマット: 各示唆を「■」で始め、太字のタイトル → 説明（2-3行）の形式で記載してください。`,

  sales: `あなたは営業戦略の専門家です。以下のデータを分析し、営業プロセス改善に関する示唆を3〜5つ、日本語で提供してください。
ファネル転換率、チャネル効率、成約パターンに焦点を当ててください。
フォーマット: 各示唆を「■」で始め、太字のタイトル → 説明（2-3行）の形式で記載してください。`,
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
    // データ取得
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

    // データスナップショット（プロンプトに含める要約データ）
    const recentFunnel = funnelMetrics.slice(-6);
    const recentRevenue = threeTierRevenue.slice(-6);

    const dataSnapshot = {
      total_customers: customers.length,
      funnel_recent_6months: recentFunnel,
      revenue_recent_6months: recentRevenue,
      channel_metrics: channelMetrics.slice(0, 10),
      agent_summary: agentSummary,
      cumulative: {
        confirmed_total: threeTierRevenue.reduce((s, t) => s + t.confirmed_total, 0),
        projected_total: threeTierRevenue.reduce((s, t) => s + t.projected_total, 0),
        forecast_total: threeTierRevenue.reduce((s, t) => s + t.forecast_total, 0),
        total_applications: funnelMetrics.reduce((s, f) => s + f.applications, 0),
        total_closed: funnelMetrics.reduce((s, f) => s + f.closed, 0),
      },
    };

    const dataText = JSON.stringify(dataSnapshot, null, 2);

    // Claude API で3カテゴリ同時生成
    const anthropic = new Anthropic({ apiKey });
    const supabase = createServiceClient();

    const results: { category: string; content: string }[] = [];

    for (const category of CATEGORIES) {
      const prompt = CATEGORY_PROMPTS[category];

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
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

      // DB保存
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
