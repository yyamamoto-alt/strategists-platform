import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetrics,
  computeThreeTierRevenue,
  computeChannelTrends,
  computeAgentRevenueSummary,
  type ChannelTrend,
} from "@/lib/data/dashboard-metrics";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import type { FunnelMetrics, ThreeTierRevenue } from "@strategy-school/shared-db";

export const dynamic = "force-dynamic";

/**
 * 直近N月のデータを抽出（当月含む）
 */
function recentMonths<T extends { period: string }>(data: T[], n: number): T[] {
  return data.slice(-n);
}

/**
 * ファネル転換率の前月比を計算
 */
function funnelComparison(recent: FunnelMetrics[], prev: FunnelMetrics[]) {
  const avg = (arr: FunnelMetrics[], fn: (f: FunnelMetrics) => number) =>
    arr.length > 0 ? arr.reduce((s, f) => s + fn(f), 0) / arr.length : 0;

  const latestMonth = recent.length > 0 ? recent[recent.length - 1] : null;
  const prevAvg = {
    applications: avg(prev, (f) => f.applications),
    scheduled_rate: avg(prev, (f) => f.scheduling_rate),
    conduct_rate: avg(prev, (f) => f.conduct_rate),
    closing_rate: avg(prev, (f) => f.closing_rate),
    closed: avg(prev, (f) => f.closed),
  };

  return { latestMonth, prevAvg };
}

const UNIFIED_PROMPT = `あなたは経営コンサルタントです。コンサル転職スクール＋人材紹介ビジネスの直近2〜3ヶ月のデータを分析し、経営上の示唆を提供してください。

以下の3つのデータソースを横断的に分析してください:
1. 売上データ（確定売上・見込み含む売上・予測売上の推移）
2. ファネルデータ（申込→日程確定→面談実施→成約の転換率推移）
3. チャネル別申込データ（各集客チャネルの直近vs前期の増減）

## 出力フォーマット

以下の3カテゴリに分けて示唆を出してください。各カテゴリ2〜3項目。

### [売上]
売上推移チャートから読み取れる示唆。確定売上の増減、見込み売上との乖離、人材紹介売上の状況など。

### [ファネル]
ファネル推移チャートから読み取れる示唆。各段階の転換率の変化、ボトルネック、前月比の改善/悪化ポイントなど。

### [チャネル]
チャネル別申込推移から読み取れる示唆。伸びているチャネル、落ちているチャネル、注力すべきチャネルなど。

## ルール
- 各項目は「■」で始め、**太字タイトル（15字以内）** → 具体的数値を含む説明（2〜3行以内）
- 直近2〜3ヶ月の変化に焦点を当てること（長期トレンドは不要）
- 数値は必ず含めること（「申込XX件、前月比+YY%」など）
- 前月比や前2ヶ月平均との比較を明示すること
- 当月のデータが月途中の場合は、その旨に触れること
- 「対策を検討すべき」「注視が必要」など、アクションにつながる表現で締めること`;

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
    const channelTrends = computeChannelTrends(customers, attributionMap);
    const agentSummary = computeAgentRevenueSummary(customers);

    // 直近3ヶ月 + 前2ヶ月（比較用）
    const recentFunnel = recentMonths(funnelMetrics, 3);
    const prevFunnel = funnelMetrics.slice(-5, -3);
    const recentRevenue = recentMonths(threeTierRevenue, 3);
    const prevRevenue = threeTierRevenue.slice(-5, -3);

    const { latestMonth: latestFunnel, prevAvg: prevFunnelAvg } =
      funnelComparison(recentFunnel, prevFunnel);

    // データスナップショット構築
    const dataSnapshot = {
      // 売上スイート
      revenue: {
        recent_3months: recentRevenue.map((r) => ({
          period: r.period,
          confirmed: r.confirmed_total,
          confirmed_school: r.confirmed_school,
          confirmed_agent: r.confirmed_agent,
          confirmed_subsidy: r.confirmed_subsidy,
          projected: r.projected_total,
          forecast: r.forecast_total,
        })),
        prev_2months: prevRevenue.map((r) => ({
          period: r.period,
          confirmed: r.confirmed_total,
          projected: r.projected_total,
        })),
        agent_summary: {
          confirmed_fee: agentSummary.total_confirmed_fee,
          projected_fee: agentSummary.total_projected_fee,
          confirmed_count: agentSummary.confirmed_count,
          in_progress_count: agentSummary.in_progress_count,
        },
      },
      // ファネルスイート
      funnel: {
        recent_3months: recentFunnel.map((f) => ({
          period: f.period,
          applications: f.applications,
          scheduled: f.scheduled,
          conducted: f.conducted,
          closed: f.closed,
          scheduling_rate: Math.round(f.scheduling_rate * 100),
          conduct_rate: Math.round(f.conduct_rate * 100),
          closing_rate: Math.round(f.closing_rate * 100),
        })),
        prev_2months_avg: {
          applications: Math.round(prevFunnelAvg.applications),
          scheduled_rate: Math.round(prevFunnelAvg.scheduled_rate * 100),
          conduct_rate: Math.round(prevFunnelAvg.conduct_rate * 100),
          closing_rate: Math.round(prevFunnelAvg.closing_rate * 100),
          closed: Math.round(prevFunnelAvg.closed),
        },
      },
      // チャネルスイート
      channels: channelTrends.slice(0, 10).map((t: ChannelTrend) => ({
        channel: t.channel,
        recent_1month: t.recentCount,
        prev_2month_avg: t.baselineMonthlyRate,
        trend: t.trend,
        trend_pct: t.trendPct,
      })),
    };

    const dataText = JSON.stringify(dataSnapshot, null, 2);

    const anthropic = new Anthropic({ apiKey });
    const supabase = createServiceClient();

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${UNIFIED_PROMPT}\n\n## データ\n\`\`\`json\n${dataText}\n\`\`\``,
        },
      ],
    });

    const content =
      message.content[0].type === "text" ? message.content[0].text : "";

    // パース: [売上] [ファネル] [チャネル] のセクションに分割
    const sections = parseInsightSections(content);

    // DB保存
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    for (const section of sections) {
      await db.from("ai_insights").insert({
        category: section.category,
        content: section.content,
        data_snapshot: dataSnapshot,
      });
    }

    return NextResponse.json({
      success: true,
      insights: sections,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("AI insights generation failed:", error);
    return NextResponse.json(
      {
        error: "AI示唆の生成に失敗しました",
        detail: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * AIレスポンスを [売上] [ファネル] [チャネル] セクションに分割
 */
function parseInsightSections(
  content: string
): { category: string; content: string }[] {
  const sectionMap: { pattern: RegExp; category: string }[] = [
    { pattern: /###?\s*\[売上\]/i, category: "revenue" },
    { pattern: /###?\s*\[ファネル\]/i, category: "funnel" },
    { pattern: /###?\s*\[チャネル\]/i, category: "channel" },
  ];

  const results: { category: string; content: string }[] = [];
  const lines = content.split("\n");
  let currentCategory = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    let matched = false;
    for (const { pattern, category } of sectionMap) {
      if (pattern.test(line)) {
        // 前セクション保存
        if (currentCategory && currentContent.length > 0) {
          results.push({
            category: currentCategory,
            content: currentContent.join("\n").trim(),
          });
        }
        currentCategory = category;
        currentContent = [];
        matched = true;
        break;
      }
    }
    if (!matched && currentCategory) {
      currentContent.push(line);
    }
  }

  // 最終セクション保存
  if (currentCategory && currentContent.length > 0) {
    results.push({
      category: currentCategory,
      content: currentContent.join("\n").trim(),
    });
  }

  // パース失敗時はまとめて1つのセクションとして返す
  if (results.length === 0) {
    results.push({ category: "general", content });
  }

  return results;
}
