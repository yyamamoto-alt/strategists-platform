"use client";

import React from "react";
import { DashboardGrid, type GridItem } from "./grid-layout";

interface SectionMap {
  charts: React.ReactNode;
  ads: React.ReactNode;
  metaAds: React.ReactNode;
  chKisotsuApp: React.ReactNode;
  chKisotsuClosed: React.ReactNode;
  chShinsotsuApp: React.ReactNode;
  chShinsotsuClosed: React.ReactNode;
  chTrends: React.ReactNode;
  salesRate: React.ReactNode;
  insights: React.ReactNode;
  receivable: React.ReactNode;
}

interface Props {
  children: SectionMap;
}

/**
 * デフォルトレイアウト（4列, rowHeight=60px）
 * 各セクションの実コンテンツサイズに合わせて最適化
 *
 * Charts:     RevenueChart 600px + FunnelChart → 全幅 h=11 (660px)
 * Ads/Meta:   chart 280px + header → 半幅ずつ h=7 (420px)
 * Channel×4:  chart 85% + header → 半幅ずつ h=6 (360px)
 * ChTrends:   バッジ一覧 → 全幅 h=3 (180px)
 * SalesRate:  コンパクトテーブル2列 → 全幅 h=5 (300px)
 * Insights:   可変テキスト → 全幅 h=8 (480px)
 * Receivable: 折畳リスト → 全幅 h=7 (420px)
 */
const GRID_ITEMS_CONFIG: { id: keyof SectionMap; x: number; y: number; w: number; h: number; minW?: number; minH?: number }[] = [
  // 売上+ファネル推移（全幅、大きめ）
  { id: "charts",           x: 0, y: 0,  w: 4, h: 11, minW: 2, minH: 6 },

  // Google Ads / Meta Ads（左右半分ずつ）
  { id: "ads",              x: 0, y: 11, w: 2, h: 7,  minW: 2, minH: 5 },
  { id: "metaAds",          x: 2, y: 11, w: 2, h: 7,  minW: 2, minH: 5 },

  // チャネル別（2×2配置）
  { id: "chKisotsuApp",     x: 0, y: 18, w: 2, h: 6,  minW: 1, minH: 4 },
  { id: "chKisotsuClosed",  x: 2, y: 18, w: 2, h: 6,  minW: 1, minH: 4 },
  { id: "chShinsotsuApp",   x: 0, y: 24, w: 2, h: 6,  minW: 1, minH: 4 },
  { id: "chShinsotsuClosed",x: 2, y: 24, w: 2, h: 6,  minW: 1, minH: 4 },

  // チャネル推移バッジ（全幅、コンパクト）
  { id: "chTrends",         x: 0, y: 30, w: 4, h: 3,  minW: 2, minH: 2 },

  // 営業マン成約率（全幅、コンパクト）
  { id: "salesRate",        x: 0, y: 33, w: 4, h: 5,  minW: 2, minH: 3 },

  // AI分析（全幅）
  { id: "insights",         x: 0, y: 38, w: 4, h: 8,  minW: 2, minH: 4 },

  // 売掛金（全幅）
  { id: "receivable",       x: 0, y: 46, w: 4, h: 7,  minW: 2, minH: 3 },
];

export function DashboardGridWrapper({ children }: Props) {
  const sections = children;

  const items: GridItem[] = GRID_ITEMS_CONFIG.map(cfg => ({
    id: cfg.id,
    defaultLayout: { x: cfg.x, y: cfg.y, w: cfg.w, h: cfg.h, minW: cfg.minW, minH: cfg.minH },
    children: sections[cfg.id],
  }));

  return <DashboardGrid items={items} />;
}
