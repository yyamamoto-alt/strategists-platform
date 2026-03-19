import { cache } from "react";
import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computeChannelTrends, computeChannelMonthlyRaw, type ChannelTrend, type ChannelMonthlyRaw } from "@/lib/data/dashboard-metrics";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { ChannelChartItem, ShinsotsuChannelChartItem, ChannelTrendItem } from "./channel-client";

/** データ取得をcacheしてリクエスト内で共有 */
const getChannelData = cache(async (): Promise<{ channelTrends: ChannelTrend[]; monthlyRaw: ChannelMonthlyRaw[] }> => {
  const [customers, attributionMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchChannelAttributions(),
  ]);

  const attrRecord: Record<string, (typeof attributionMap)[number]> = {};
  for (const a of attributionMap) attrRecord[a.customer_id] = a;

  return {
    channelTrends: computeChannelTrends(customers, attrRecord),
    monthlyRaw: computeChannelMonthlyRaw(customers, attrRecord),
  };
});

/** 旧互換: 全部まとめて表示 */
export async function ChannelSection() {
  const { channelTrends, monthlyRaw } = await getChannelData();
  if (!channelTrends || channelTrends.length === 0) return null;
  const { ChannelClient } = await import("./channel-client");
  return <ChannelClient channelTrends={channelTrends} monthlyRaw={monthlyRaw} />;
}

/** 個別グリッドアイテム用 */
export async function ChannelKisotsuApp() {
  const { monthlyRaw } = await getChannelData();
  return <ChannelChartItem data={monthlyRaw} attrFilter="kisotsu" metricFilter="application" title="既卒 申し込み" />;
}

export async function ChannelKisotsuClosed() {
  const { monthlyRaw } = await getChannelData();
  return <ChannelChartItem data={monthlyRaw} attrFilter="kisotsu" metricFilter="closed" title="既卒 成約" />;
}

export async function ChannelShinsotsuApp() {
  const { monthlyRaw } = await getChannelData();
  return <ShinsotsuChannelChartItem data={monthlyRaw} metricFilter="application" title="新卒 申し込み" />;
}

export async function ChannelShinsotsuClosed() {
  const { monthlyRaw } = await getChannelData();
  return <ShinsotsuChannelChartItem data={monthlyRaw} metricFilter="closed" title="新卒 成約" />;
}

export async function ChannelTrends() {
  const { channelTrends } = await getChannelData();
  if (!channelTrends || channelTrends.length === 0) return null;
  return <ChannelTrendItem channelTrends={channelTrends} />;
}
