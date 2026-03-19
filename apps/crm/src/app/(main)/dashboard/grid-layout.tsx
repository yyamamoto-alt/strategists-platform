"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Responsive,
  useContainerWidth,
  verticalCompactor,
  type ResponsiveLayouts,
  type Layout,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";

const STORAGE_KEY = "crm-dashboard-layout-v2";
const BREAKPOINTS = { lg: 1200, md: 800, sm: 480, xs: 0 };
const COLS = { lg: 4, md: 2, sm: 1, xs: 1 };

export interface GridItem {
  id: string;
  defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number };
  children: React.ReactNode;
}

interface DashboardGridProps {
  items: GridItem[];
}

function loadSavedLayouts(): ResponsiveLayouts | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

function saveLayouts(layouts: ResponsiveLayouts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch { /* ignore */ }
}

export function DashboardGrid({ items }: DashboardGridProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { width } = useContainerWidth({ initialWidth: 1200 });

  // containerRefの幅を使う (useContainerWidthがref無しなので自前計測)
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    setMounted(true);
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const defaultLayouts: ResponsiveLayouts = {
    lg: items.map(item => ({
      i: item.id,
      ...item.defaultLayout,
      minW: item.defaultLayout.minW ?? 1,
      minH: item.defaultLayout.minH ?? 2,
    })),
    md: items.map(item => ({
      i: item.id,
      x: item.defaultLayout.x % 2,
      y: item.defaultLayout.y,
      w: Math.min(item.defaultLayout.w, 2),
      h: item.defaultLayout.h,
      minW: 1,
      minH: item.defaultLayout.minH ?? 2,
    })),
    sm: items.map(item => ({
      i: item.id,
      x: 0,
      y: item.defaultLayout.y,
      w: 1,
      h: item.defaultLayout.h,
      minW: 1,
      minH: item.defaultLayout.minH ?? 2,
    })),
  };

  const savedLayouts = loadSavedLayouts();
  const initialLayouts = savedLayouts || defaultLayouts;

  const handleLayoutChange = useCallback((_current: Layout, allLayouts: ResponsiveLayouts) => {
    saveLayouts(allLayouts);
  }, []);

  const handleResetLayout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }, []);

  if (!mounted) {
    return (
      <div ref={containerRef} className="px-6 space-y-6">
        {items.map(item => (
          <div key={item.id}>{item.children}</div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="px-6">
      <div className="flex justify-end mb-2">
        <button
          onClick={handleResetLayout}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-white/5 hover:border-white/20"
        >
          レイアウトをリセット
        </button>
      </div>
      <Responsive
        className="dashboard-grid"
        width={containerWidth || width}
        layouts={initialLayouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={120}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        onLayoutChange={handleLayoutChange}
        dragConfig={{ enabled: true, bounded: false, handle: ".grid-drag-handle", threshold: 3 }}
        resizeConfig={{ enabled: true, handles: ["se"] }}
        compactor={verticalCompactor}
      >
        {items.map(item => (
          <div key={item.id} className="relative group overflow-auto">
            <div className="grid-drag-handle absolute top-0 left-0 right-0 h-8 cursor-grab active:cursor-grabbing z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-white/10 rounded-full px-3 py-0.5 text-[10px] text-gray-400 backdrop-blur-sm">
                ⋮⋮ ドラッグで移動 / 右下でリサイズ
              </div>
            </div>
            <div className="h-full overflow-auto">
              {item.children}
            </div>
          </div>
        ))}
      </Responsive>
      <style jsx global>{`
        .dashboard-grid .react-grid-item {
          transition: all 200ms ease;
          overflow: hidden;
        }
        .dashboard-grid .react-grid-item.react-draggable-dragging {
          z-index: 100;
          opacity: 0.9;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }
        .dashboard-grid .react-grid-item.resizing {
          z-index: 100;
          opacity: 0.95;
        }
        .dashboard-grid .react-grid-placeholder {
          background: rgba(59, 130, 246, 0.15) !important;
          border: 2px dashed rgba(59, 130, 246, 0.3) !important;
          border-radius: 12px;
        }
        .dashboard-grid .react-resizable-handle {
          position: absolute;
          width: 20px;
          height: 20px;
          bottom: 0;
          right: 0;
          cursor: se-resize;
          z-index: 10;
        }
        .dashboard-grid .react-resizable-handle::after {
          content: '';
          position: absolute;
          right: 4px;
          bottom: 4px;
          width: 8px;
          height: 8px;
          border-right: 2px solid rgba(255,255,255,0.2);
          border-bottom: 2px solid rgba(255,255,255,0.2);
          border-radius: 0 0 2px 0;
          transition: border-color 0.2s;
        }
        .dashboard-grid .react-grid-item:hover .react-resizable-handle::after {
          border-color: rgba(255,255,255,0.5);
        }
      `}</style>
    </div>
  );
}
