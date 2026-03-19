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
 * デフォルトレイアウト: 4列グリッド, rowHeight=60px
 * w=4=全幅, w=2=半幅, w=1=1/4幅
 * h単位=60px（例: h=6 → 360px）
 */
const GRID_ITEMS_CONFIG: { id: keyof SectionMap; x: number; y: number; w: number; h: number; minW?: number; minH?: number }[] = [
  // 売上・ファネル推移（全幅）
  { id: "charts",           x: 0, y: 0,  w: 4, h: 8,  minW: 2, minH: 5 },
  // 広告パフォーマンス（左右半分ずつ）
  { id: "ads",              x: 0, y: 8,  w: 2, h: 7,  minW: 2, minH: 5 },
  { id: "metaAds",          x: 2, y: 8,  w: 2, h: 7,  minW: 2, minH: 5 },
  // チャネル別（4つ独立、2x2グリッド）
  { id: "chKisotsuApp",     x: 0, y: 15, w: 2, h: 6,  minW: 1, minH: 4 },
  { id: "chKisotsuClosed",  x: 2, y: 15, w: 2, h: 6,  minW: 1, minH: 4 },
  { id: "chShinsotsuApp",   x: 0, y: 21, w: 2, h: 6,  minW: 1, minH: 4 },
  { id: "chShinsotsuClosed",x: 2, y: 21, w: 2, h: 6,  minW: 1, minH: 4 },
  // チャネル推移バッジ
  { id: "chTrends",         x: 0, y: 27, w: 4, h: 3,  minW: 2, minH: 2 },
  // 営業マン成約率
  { id: "salesRate",        x: 0, y: 30, w: 4, h: 5,  minW: 2, minH: 3 },
  // AI分析
  { id: "insights",         x: 0, y: 35, w: 4, h: 6,  minW: 2, minH: 4 },
  // 売掛
  { id: "receivable",       x: 0, y: 41, w: 4, h: 5,  minW: 2, minH: 3 },
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
