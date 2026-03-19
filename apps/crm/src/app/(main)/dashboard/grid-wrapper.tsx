"use client";

import React from "react";
import { DashboardGrid, type GridItem } from "./grid-layout";

interface SectionMap {
  charts: React.ReactNode;
  ads: React.ReactNode;
  metaAds: React.ReactNode;
  channel: React.ReactNode;
  salesRate: React.ReactNode;
  insights: React.ReactNode;
  receivable: React.ReactNode;
}

interface Props {
  children: SectionMap;
}

/**
 * グリッドアイテムのデフォルトレイアウト定義
 * lgブレークポイント: 4列グリッド
 * w=4 は全幅, w=2 は半分, w=1 は1/4
 */
const GRID_ITEMS_CONFIG: { id: keyof SectionMap; x: number; y: number; w: number; h: number; minW?: number; minH?: number }[] = [
  { id: "charts",     x: 0, y: 0,  w: 4, h: 5, minW: 2, minH: 4 },
  { id: "ads",        x: 0, y: 5,  w: 2, h: 4, minW: 2, minH: 3 },
  { id: "metaAds",    x: 2, y: 5,  w: 2, h: 4, minW: 2, minH: 3 },
  { id: "channel",    x: 0, y: 9,  w: 4, h: 4, minW: 2, minH: 3 },
  { id: "salesRate",  x: 0, y: 13, w: 4, h: 3, minW: 2, minH: 2 },
  { id: "insights",   x: 0, y: 16, w: 4, h: 4, minW: 2, minH: 3 },
  { id: "receivable", x: 0, y: 20, w: 4, h: 3, minW: 2, minH: 2 },
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
