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
    // 既存（互換性維持）
    問い合わせ: "bg-gray-100 text-gray-800",
    日程確定: "bg-blue-100 text-blue-800",
    面談実施: "bg-indigo-100 text-indigo-800",
    提案中: "bg-yellow-100 text-yellow-800",
    入金済: "bg-emerald-100 text-emerald-800",
    保留: "bg-orange-100 text-orange-800",
    // 実データ: アクティブ
    日程未確: "bg-slate-100 text-slate-800",
    検討中: "bg-blue-100 text-blue-800",
    長期検討: "bg-indigo-100 text-indigo-800",
    // 実データ: 成約系
    成約: "bg-green-100 text-green-800",
    その他購入: "bg-teal-100 text-teal-800",
    動画講座購入: "bg-teal-100 text-teal-800",
    追加指導: "bg-emerald-100 text-emerald-800",
    // 実データ: 失注系
    失注: "bg-red-100 text-red-800",
    失注見込: "bg-orange-100 text-orange-800",
    "失注見込(自動)": "bg-orange-100 text-orange-800",
    CL: "bg-red-100 text-red-800",
    全額返金: "bg-rose-100 text-rose-800",
    // 実データ: 未実施系
    NoShow: "bg-amber-100 text-amber-800",
    未実施: "bg-yellow-100 text-yellow-800",
    実施不可: "bg-yellow-100 text-yellow-800",
    非実施対象: "bg-gray-100 text-gray-800",
    // その他
    その他: "bg-gray-100 text-gray-800",
  };
  return colors[stage] || "bg-gray-100 text-gray-800";
}

export function getAttributeColor(attribute: string): string {
  return attribute.includes("既卒")
    ? "bg-purple-100 text-purple-800"
    : "bg-cyan-100 text-cyan-800";
}

export function getDealStatusColor(status: string): string {
  const colors: Record<string, string> = {
    未対応: "bg-gray-100 text-gray-800",
    対応中: "bg-blue-100 text-blue-800",
    面談済: "bg-indigo-100 text-indigo-800",
    成約: "bg-green-100 text-green-800",
    失注: "bg-red-100 text-red-800",
    保留: "bg-orange-100 text-orange-800",
    // 実データ
    実施: "bg-green-100 text-green-800",
    未実施: "bg-yellow-100 text-yellow-800",
    noshow: "bg-amber-100 text-amber-800",
    キャンセル: "bg-red-100 text-red-800",
    実施不可: "bg-gray-100 text-gray-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}
