/**
 * マーケティングチャネル帰属ロジック
 * client + server safe (Supabaseクライアント不使用)
 */

// ================================================================
// 型定義
// ================================================================

export interface MappingRule {
  id: string;
  source_field: string;
  source_value: string;
  match_type: "exact" | "contains" | "prefix";
  channel_name: string;
  notes: string | null;
  priority: number;
}

export interface MarketingChannel {
  id: string;
  name: string;
  category: string;
  is_paid: boolean;
  priority: number;
  is_active: boolean;
}

export interface AttributionResult {
  marketing_channel: string;
  attribution_source: string;
  confidence: "high" | "medium" | "low";
  touch_first: string | null;
  touch_decision: string | null;
  touch_last: string | null;
  is_multi_touch: boolean;
  raw_data: Record<string, string | null>;
}

// ================================================================
// 正規化: ソース値をマッピングルールでチャネル名に変換
// ================================================================

function normalizeValue(
  sourceField: string,
  sourceValue: string | null | undefined,
  rules: MappingRule[]
): string | null {
  if (!sourceValue || sourceValue.trim() === "") return null;

  const fieldRules = rules
    .filter((r) => r.source_field === sourceField)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of fieldRules) {
    const val = sourceValue.trim();
    const ruleVal = rule.source_value;

    switch (rule.match_type) {
      case "exact":
        if (val.toLowerCase() === ruleVal.toLowerCase()) return rule.channel_name;
        break;
      case "contains":
        if (val.toLowerCase().includes(ruleVal.toLowerCase())) return rule.channel_name;
        break;
      case "prefix":
        if (val.toLowerCase().startsWith(ruleVal.toLowerCase())) return rule.channel_name;
        break;
    }
  }

  return null;
}

// ================================================================
// 広告チャネル判定
// ================================================================

const AD_CHANNELS = new Set(["FB広告", "Google広告", "X広告"]);

function isAdChannel(channelName: string | null): boolean {
  return channelName != null && AD_CHANNELS.has(channelName);
}

// ================================================================
// メイン帰属ロジック
// ================================================================

export interface CustomerRawData {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  initial_channel?: string | null;
  application_reason?: string | null;
  sales_route?: string | null;
}

export function computeAttribution(
  customer: CustomerRawData,
  rules: MappingRule[]
): AttributionResult {
  const raw: Record<string, string | null> = {
    utm_source: customer.utm_source || null,
    utm_medium: customer.utm_medium || null,
    utm_campaign: customer.utm_campaign || null,
    initial_channel: customer.initial_channel || null,
    application_reason: customer.application_reason || null,
    sales_route: customer.sales_route || null,
  };

  // 各ソースフィールドを正規化
  const utmChannel = normalizeValue("utm_source", customer.utm_source, rules);
  const initialChannel = normalizeValue("initial_channel", customer.initial_channel, rules);
  const reasonChannel = normalizeValue("application_reason", customer.application_reason, rules);
  const salesChannel = normalizeValue("sales_route", customer.sales_route, rules);

  // タッチポイント
  const touch_last = utmChannel;
  const touch_first = initialChannel;
  const touch_decision = reasonChannel;

  // 有効なソース数をカウント
  const sources = [utmChannel, initialChannel, reasonChannel, salesChannel].filter(Boolean);
  const is_multi_touch = sources.length >= 2;

  // 優先度ルールで帰属決定
  let marketing_channel: string;
  let attribution_source: string;
  let confidence: "high" | "medium" | "low";

  // 1. UTMが広告チャネル → 最優先
  if (isAdChannel(utmChannel)) {
    marketing_channel = utmChannel!;
    attribution_source = "utm_source";
    confidence = "high";
  }
  // 2. UTM + initial_channel 一致
  else if (utmChannel && initialChannel && utmChannel === initialChannel) {
    marketing_channel = utmChannel;
    attribution_source = "utm_source+initial_channel";
    confidence = "high";
  }
  // 3. UTMあり
  else if (utmChannel) {
    marketing_channel = utmChannel;
    attribution_source = "utm_source";
    confidence = "medium";
  }
  // 4. initial_channelあり
  else if (initialChannel) {
    marketing_channel = initialChannel;
    attribution_source = "initial_channel";
    confidence = "medium";
  }
  // 5. application_reasonあり
  else if (reasonChannel) {
    marketing_channel = reasonChannel;
    attribution_source = "application_reason";
    confidence = "low";
  }
  // 6. sales_routeあり
  else if (salesChannel) {
    marketing_channel = salesChannel;
    attribution_source = "sales_route";
    confidence = "low";
  }
  // 7. 全てなし → 不明
  else {
    // utm_source が未マッチだがテキストとして存在する場合、そのまま使用
    if (customer.utm_source && customer.utm_source.trim() !== "") {
      marketing_channel = customer.utm_source.trim();
      attribution_source = "utm_source_raw";
      confidence = "low";
    } else if (customer.initial_channel && customer.initial_channel.trim() !== "") {
      marketing_channel = customer.initial_channel.trim();
      attribution_source = "initial_channel_raw";
      confidence = "low";
    } else {
      marketing_channel = "不明";
      attribution_source = "fallback";
      confidence = "low";
    }
  }

  return {
    marketing_channel,
    attribution_source,
    confidence,
    touch_first,
    touch_decision,
    touch_last,
    is_multi_touch,
    raw_data: raw,
  };
}
