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
    "成約見込(未入金)": "bg-red-700 text-white",
    // 購入系（ピンク）
    動画講座購入: "bg-pink-500 text-white",
    その他購入: "bg-pink-500 text-white",
    // 追加指導・枠確保（オレンジ）
    追加指導: "bg-orange-500 text-white",
    枠確保: "bg-orange-500 text-white",
    // 検討系（黄色）
    検討中: "bg-yellow-500 text-black",
    "追加指導(検討中)": "bg-yellow-500 text-black",
    // 未実施系（シアン）
    未実施: "bg-cyan-500 text-white",
    日程未確: "bg-gray-500 text-white",
    日程確定: "bg-cyan-600 text-white",
    // 失注・ネガティブ系（ダーク）
    失注: "bg-stone-600 text-white",
    失注見込: "bg-stone-600 text-white",
    "失注見込(自動)": "bg-stone-600 text-white",
    長期検討: "bg-stone-600 text-white",
    CL: "bg-amber-800 text-white",
    NoShow: "bg-amber-800 text-white",
    実施不可: "bg-amber-800 text-white",
    "途中解約(成約)": "bg-stone-600 text-white",
    "追加指導(NoShow)": "bg-stone-600 text-white",
    "追加指導(失注)": "bg-stone-600 text-white",
    "追加指導(CL)": "bg-stone-600 text-white",
    キャンセル: "bg-stone-600 text-white",
    直前キャンセル: "bg-stone-600 text-white",
    // 紫系
    非実施対象: "bg-purple-600 text-white",
    全額返金: "bg-purple-700 text-white",
    // レガシー
    問い合わせ: "bg-slate-500 text-white",
    その他: "bg-gray-500 text-white",
  };
  return colors[stage] || "bg-gray-500 text-white";
}

export function getChannelColor(channel: string): string {
  const colors: Record<string, string> = {
    "Google広告": "bg-green-600 text-white",
    "SEO(直LP)": "bg-teal-600 text-white",
    "SEO(Blog)": "bg-teal-500 text-white",
    "SEO": "bg-teal-600 text-white",
    "X": "bg-gray-800 text-white",
    "Youtube": "bg-red-600 text-white",
    "YouTube広告": "bg-red-700 text-white",
    "YouTube": "bg-red-600 text-white",
    "コンサルタイムズ": "bg-indigo-600 text-white",
    "note": "bg-emerald-600 text-white",
    "有料note": "bg-emerald-700 text-white",
    "ココナラ": "bg-sky-600 text-white",
    "Udemy": "bg-violet-600 text-white",
    "アフィリエイト": "bg-amber-600 text-white",
    "インスタ": "bg-pink-500 text-white",
    "Instagram広告": "bg-pink-600 text-white",
    "FB広告": "bg-blue-700 text-white",
    "Meta広告": "bg-blue-600 text-white",
    "口コミ・紹介": "bg-purple-600 text-white",
    "口コミ": "bg-purple-500 text-white",
    "紹介": "bg-purple-600 text-white",
    "イベント": "bg-rose-600 text-white",
    "Prism": "bg-cyan-700 text-white",
    "LINE": "bg-green-500 text-white",
    "SNS": "bg-sky-500 text-white",
    "直接流入": "bg-indigo-500 text-white",
    "不明": "bg-gray-500 text-white",
    "その他": "bg-gray-500 text-white",
  };
  if (colors[channel]) return colors[channel];
  for (const [key, val] of Object.entries(colors)) {
    if (channel.includes(key) || key.includes(channel)) return val;
  }
  return "bg-gray-500 text-white";
}

export function getAttributeColor(attribute: string): string {
  if (attribute.includes("既卒")) return "bg-purple-600 text-white";
  if (attribute.includes("27卒")) return "bg-sky-600 text-white";
  if (attribute.includes("28卒")) return "bg-sky-500 text-white";
  if (attribute.includes("26卒")) return "bg-sky-700 text-white";
  return "bg-cyan-600 text-white";
}

export function getPlanColor(plan: string): string {
  const colors: Record<string, string> = {
    "自社エージェント専用プラン": "bg-violet-600 text-white",
    "自社エージェント併用プラン": "bg-indigo-600 text-white",
    "自社エージェント単体": "bg-fuchsia-600 text-white",
    "その他": "bg-gray-500 text-white",
  };
  if (colors[plan]) return colors[plan];
  // プラン名の部分一致
  if (plan.includes("スタンダード")) return "bg-blue-600 text-white";
  if (plan.includes("ライト")) return "bg-sky-500 text-white";
  if (plan.includes("ミニマム")) return "bg-teal-500 text-white";
  if (plan.includes("選コミュ")) return "bg-amber-600 text-white";
  if (plan.includes("総コン")) return "bg-orange-600 text-white";
  if (plan.includes("エージェント")) return "bg-violet-600 text-white";
  if (plan.includes("動画")) return "bg-pink-500 text-white";
  if (plan.includes("追加")) return "bg-orange-500 text-white";
  return "bg-gray-500 text-white";
}

export function getSalesPersonColor(name: string): string {
  // 担当者名からハッシュで安定した色を割り当て
  const palette = [
    "bg-blue-600 text-white",
    "bg-emerald-600 text-white",
    "bg-violet-600 text-white",
    "bg-rose-600 text-white",
    "bg-amber-600 text-white",
    "bg-cyan-600 text-white",
    "bg-indigo-600 text-white",
    "bg-pink-600 text-white",
    "bg-teal-600 text-white",
    "bg-orange-600 text-white",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

export function getProbabilityColor(prob: number): string {
  if (prob >= 0.8) return "bg-red-600 text-white";
  if (prob >= 0.6) return "bg-orange-500 text-white";
  if (prob >= 0.4) return "bg-yellow-500 text-black";
  if (prob >= 0.2) return "bg-sky-500 text-white";
  return "bg-gray-500 text-white";
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
