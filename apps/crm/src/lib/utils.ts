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
    // 成約系（赤）
    成約: "bg-red-600 text-white",
    入金済: "bg-red-600 text-white",
    "成約(追加指導経由)": "bg-red-600 text-white",
    "成約見込(未入金)": "bg-red-700 text-red-100",
    // 購入系（ピンク）
    動画講座購入: "bg-pink-500/70 text-white",
    その他購入: "bg-pink-500/70 text-white",
    // 追加指導・枠確保（オレンジ）
    追加指導: "bg-orange-500/80 text-white",
    枠確保: "bg-orange-500/80 text-white",
    // 検討系（黄色）
    検討中: "bg-yellow-600/80 text-yellow-50",
    "追加指導(検討中)": "bg-yellow-600/80 text-yellow-50",
    // 未実施系（青）
    未実施: "bg-blue-500/70 text-white",
    日程未確: "bg-gray-500/70 text-gray-100",
    日程確定: "bg-blue-500/70 text-white",
    // 失注・ネガティブ系（ダーク）
    失注: "bg-stone-600/80 text-stone-100",
    失注見込: "bg-stone-600/80 text-stone-100",
    "失注見込(自動)": "bg-stone-600/80 text-stone-100",
    長期検討: "bg-stone-600/80 text-stone-100",
    CL: "bg-amber-800/80 text-amber-100",
    NoShow: "bg-amber-800/80 text-amber-100",
    実施不可: "bg-amber-800/80 text-amber-100",
    "途中解約(成約)": "bg-stone-600/80 text-stone-100",
    "追加指導(NoShow)": "bg-stone-600/80 text-stone-100",
    "追加指導(失注)": "bg-stone-600/80 text-stone-100",
    "追加指導(CL)": "bg-stone-600/80 text-stone-100",
    キャンセル: "bg-stone-600/80 text-stone-100",
    直前キャンセル: "bg-stone-600/80 text-stone-100",
    // 紫系
    非実施対象: "bg-purple-600/70 text-purple-100",
    全額返金: "bg-purple-700/70 text-purple-100",
    // レガシー
    問い合わせ: "bg-slate-500/70 text-slate-100",
    その他: "bg-gray-500/70 text-gray-100",
  };
  return colors[stage] || "bg-gray-500/70 text-gray-100";
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
