/**
 * マーケティングチャネル帰属ロジック
 * ファーストタッチモデル + ピュア/複合区別
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
  marketing_channel: string;       // 最終帰属 ("ピュアFB広告", "複合X", "予測SEO" 等)
  base_channel: string;            // ベースチャネル ("FB広告", "X", "SEO" 等)
  is_pure: boolean;                // ピュア=true, 複合=false
  attribution_source: string;
  confidence: "high" | "medium" | "low";
  touch_first: string | null;      // 初回認知チャネル
  touch_decision: string | null;   // 決め手チャネル
  touch_last: string | null;       // 最終申込チャネル (utm)
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
  // 「不明」は情報なしとして扱う
  if (sourceValue.trim() === "不明") return null;

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
// ピュア/複合判定
// ================================================================

// ピュア/複合 prefix を付与するメインチャネル
const MAIN_CHANNELS = new Set([
  "FB広告", "Google広告", "X", "YouTube", "SEO", "自社メディア", "コンサルタイムズ",
]);

// ピュア/複合の判定から除外するチャネル（配信手段であって認知チャネルではない）
const DELIVERY_CHANNELS = new Set(["Lステップ"]);

function isMainChannel(ch: string | null): boolean {
  return ch != null && MAIN_CHANNELS.has(ch);
}

// ================================================================
// メイン帰属ロジック（ファーストタッチモデル）
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
  const initialChannel = normalizeValue("initial_channel", customer.initial_channel, rules);
  const reasonChannel = normalizeValue("application_reason", customer.application_reason, rules);
  const utmChannel = normalizeValue("utm_source", customer.utm_source, rules);
  const salesChannel = normalizeValue("sales_route", customer.sales_route, rules);

  // タッチポイント
  const touch_first = initialChannel;
  const touch_decision = reasonChannel;
  const touch_last = utmChannel;

  // 有効なソース数をカウント（ユニークチャネル）
  const uniqueChannels = new Set(
    [initialChannel, reasonChannel, utmChannel, salesChannel].filter(Boolean)
  );
  const is_multi_touch = uniqueChannels.size >= 2;

  // ─── 帰属決定: 広告最優先 → ファーストタッチ ───
  let base_channel: string;
  let attribution_source: string;
  let confidence: "high" | "medium" | "low";

  const AD_CHANNELS = new Set(["FB広告", "Google広告", "X広告"]);

  // 1. utm が広告チャネル → 最優先（広告費ROI追跡）
  if (utmChannel && AD_CHANNELS.has(utmChannel)) {
    base_channel = utmChannel;
    attribution_source = "utm_source";
    confidence = "high";
  }
  // 2. initial_channel (初回認知) → ファーストタッチ
  else if (initialChannel) {
    base_channel = initialChannel;
    attribution_source = "initial_channel";
    confidence = utmChannel === initialChannel ? "high" : "medium";
  }
  // 3. application_reason (決め手) → 3番目
  else if (reasonChannel) {
    base_channel = reasonChannel;
    attribution_source = "application_reason";
    confidence = "medium";
  }
  // 4. utm_source（非広告）→ 4番目
  else if (utmChannel) {
    base_channel = utmChannel;
    attribution_source = "utm_source";
    confidence = "medium";
  }
  // 5. sales_route → 5番目
  else if (salesChannel) {
    base_channel = salesChannel;
    attribution_source = "sales_route";
    confidence = "low";
  }
  // 5. raw値フォールバック
  else if (customer.initial_channel && customer.initial_channel.trim() !== "" && customer.initial_channel.trim() !== "不明") {
    base_channel = customer.initial_channel.trim();
    attribution_source = "initial_channel_raw";
    confidence = "low";
  }
  else if (customer.utm_source && customer.utm_source.trim() !== "" && customer.utm_source.trim() !== "不明") {
    base_channel = customer.utm_source.trim();
    attribution_source = "utm_source_raw";
    confidence = "low";
  }
  // 6. 全情報なし → 予測SEO
  else {
    base_channel = "予測SEO";
    attribution_source = "predicted";
    confidence = "low";
  }

  // ─── ピュア/複合判定 ───
  // 6大チャネルの場合のみ prefix を付与
  let is_pure = true;
  let marketing_channel: string;

  if (isMainChannel(base_channel)) {
    // 他のタッチポイントに異なるチャネルがあれば「複合」
    // ただし以下は除外:
    //   - 配信手段（Lステップ等）
    //   - 広告ベースの場合、SEOは同系扱い（検索→広告クリックは自然な動線）
    //   - 広告ベースの場合、初回認知=不明/なし も無視
    const adBase = AD_CHANNELS.has(base_channel);
    // sales_routeは営業メモなのでピュア/複合判定に含めない
    const otherChannels = [initialChannel, reasonChannel, utmChannel]
      .filter((ch): ch is string => {
        if (ch == null || ch === base_channel) return false;
        if (DELIVERY_CHANNELS.has(ch)) return false;
        // 広告ベース時: SEOは同系（検索経由の広告クリック）
        if (adBase && ch === "SEO") return false;
        return true;
      });

    is_pure = otherChannels.length === 0;
    marketing_channel = `${is_pure ? "ピュア" : "複合"}${base_channel}`;
  } else {
    // note, 口コミ・紹介, インフルエンサー, 予測SEO 等 → prefix なし
    marketing_channel = base_channel;
  }

  return {
    marketing_channel,
    base_channel,
    is_pure,
    attribution_source,
    confidence,
    touch_first,
    touch_decision,
    touch_last,
    is_multi_touch,
    raw_data: raw,
  };
}
