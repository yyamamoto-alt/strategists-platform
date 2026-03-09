import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 100)}%`;
}

export function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    // 成約系（赤バッジ）
    成約: "bg-red-600/30 text-red-300",
    入金済: "bg-red-600/30 text-red-300",
    "成約(追加指導経由)": "bg-red-600/30 text-red-300",
    "成約見込(未入金)": "bg-red-700/30 text-red-400",
    // 購入系（ピンク）
    動画講座購入: "bg-pink-400/25 text-pink-200",
    その他購入: "bg-pink-400/25 text-pink-200",
    // 追加指導・枠確保（オレンジ）
    追加指導: "bg-orange-500/30 text-orange-300",
    枠確保: "bg-orange-500/30 text-orange-300",
    // 検討系（黄色）
    検討中: "bg-yellow-500/30 text-yellow-300",
    "追加指導(検討中)": "bg-yellow-500/30 text-yellow-300",
    // 未実施系（青）
    未実施: "bg-blue-500/25 text-blue-300",
    日程未確: "bg-gray-500/25 text-gray-300",
    日程確定: "bg-blue-500/25 text-blue-300",
    // 失注・ネガティブ系（ダークブラウン）
    失注: "bg-stone-700/50 text-stone-300",
    失注見込: "bg-stone-700/50 text-stone-300",
    "失注見込(自動)": "bg-stone-700/50 text-stone-300",
    長期検討: "bg-stone-700/50 text-stone-300",
    CL: "bg-amber-900/40 text-amber-400",
    NoShow: "bg-amber-900/40 text-amber-400",
    実施不可: "bg-amber-900/40 text-amber-400",
    "途中解約(成約)": "bg-stone-700/50 text-stone-300",
    "追加指導(NoShow)": "bg-stone-700/50 text-stone-300",
    "追加指導(失注)": "bg-stone-700/50 text-stone-300",
    "追加指導(CL)": "bg-stone-700/50 text-stone-300",
    キャンセル: "bg-stone-700/50 text-stone-300",
    直前キャンセル: "bg-stone-700/50 text-stone-300",
    // 紫系
    非実施対象: "bg-purple-600/30 text-purple-300",
    全額返金: "bg-purple-700/30 text-purple-300",
    // レガシー
    問い合わせ: "bg-slate-500/25 text-slate-300",
    その他: "bg-gray-500/25 text-gray-400",
  };
  return colors[stage] || "bg-gray-500/25 text-gray-400";
}

export function getAttributeColor(attribute: string): string {
  return attribute.includes("既卒")
    ? "bg-purple-500/20 text-purple-300"
    : "bg-cyan-500/20 text-cyan-300";
}

export function getDealStatusColor(status: string): string {
  const colors: Record<string, string> = {
    未対応: "bg-gray-500/20 text-gray-400",
    対応中: "bg-blue-500/20 text-blue-300",
    進行中: "bg-blue-500/20 text-blue-300",
    面談済: "bg-indigo-500/20 text-indigo-300",
    成約: "bg-green-500/25 text-green-300",
    完了: "bg-green-500/25 text-green-300",
    失注: "bg-red-500/25 text-red-300",
    保留: "bg-orange-500/20 text-orange-300",
    実施: "bg-green-500/20 text-green-300",
    未実施: "bg-yellow-500/20 text-yellow-300",
    noshow: "bg-amber-500/20 text-amber-300",
    キャンセル: "bg-red-500/20 text-red-300",
    実施不可: "bg-gray-500/20 text-gray-400",
  };
  return colors[status] || "bg-gray-500/20 text-gray-400";
}
