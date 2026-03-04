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
    // アクティブ
    日程未確: "bg-slate-500/20 text-slate-300",
    日程確定: "bg-blue-500/20 text-blue-300",
    検討中: "bg-sky-500/20 text-sky-300",
    長期検討: "bg-indigo-500/20 text-indigo-300",
    面談実施: "bg-violet-500/20 text-violet-300",
    提案中: "bg-amber-500/20 text-amber-300",
    保留: "bg-orange-500/20 text-orange-300",
    // 成約系
    成約: "bg-green-500/25 text-green-300",
    入金済: "bg-emerald-500/25 text-emerald-300",
    その他購入: "bg-teal-500/20 text-teal-300",
    動画講座購入: "bg-teal-500/20 text-teal-300",
    追加指導: "bg-emerald-500/20 text-emerald-300",
    // 失注系
    失注: "bg-red-500/25 text-red-300",
    失注見込: "bg-orange-500/20 text-orange-300",
    "失注見込(自動)": "bg-orange-500/20 text-orange-300",
    CL: "bg-red-500/20 text-red-300",
    全額返金: "bg-rose-500/20 text-rose-300",
    // 未実施系
    NoShow: "bg-amber-500/20 text-amber-300",
    未実施: "bg-yellow-500/20 text-yellow-300",
    実施不可: "bg-yellow-500/20 text-yellow-300",
    非実施対象: "bg-gray-500/20 text-gray-400",
    // レガシー
    問い合わせ: "bg-slate-500/20 text-slate-300",
    その他: "bg-gray-500/20 text-gray-400",
  };
  return colors[stage] || "bg-gray-500/20 text-gray-400";
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
