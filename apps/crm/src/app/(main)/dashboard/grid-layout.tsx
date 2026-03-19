"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Responsive,
  verticalCompactor,
  type ResponsiveLayouts,
  type Layout,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";

const STORAGE_KEY = "crm-dashboard-layout-v3";
const BREAKPOINTS = { lg: 1200, md: 800, sm: 480, xs: 0 };
const COLS = { lg: 4, md: 2, sm: 1, xs: 1 };
const ROW_HEIGHT = 60;
const MARGIN: [number, number] = [12, 12];

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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts)); } catch { /* ignore */ }
}

export function DashboardGrid({ items }: DashboardGridProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    setMounted(true);
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
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
      i: item.id, x: 0, y: item.defaultLayout.y, w: 1, h: item.defaultLayout.h,
      minW: 1, minH: item.defaultLayout.minH ?? 2,
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
      <div ref={containerRef} className="px-6 space-y-4">
        {items.map(item => <div key={item.id}>{item.children}</div>)}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="px-6">
      <div className="flex justify-end mb-1">
        <button onClick={handleResetLayout}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-white/5 hover:border-white/20">
          レイアウトリセット
        </button>
      </div>
      <Responsive
        className="dashboard-grid"
        width={containerWidth}
        layouts={initialLayouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={MARGIN}
        containerPadding={[0, 0]}
        autoSize={true}
        onLayoutChange={handleLayoutChange}
        dragConfig={{ enabled: true, bounded: false, handle: ".grid-drag-handle", threshold: 5 }}
        resizeConfig={{ enabled: true, handles: ["s", "se"] }}
        compactor={verticalCompactor}
      >
        {items.map(item => (
          <div key={item.id} className="grid-item-wrapper">
            {/* ドラッグハンドル: カード上端の細いバー */}
            <div className="grid-drag-handle" />
            <div className="grid-item-content">
              {item.children}
            </div>
          </div>
        ))}
      </Responsive>
      <style jsx global>{`
        .dashboard-grid .react-grid-item {
          transition: all 150ms ease;
        }
        .dashboard-grid .react-grid-item.react-draggable-dragging {
          transition: none;
          z-index: 100;
          opacity: 0.85;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
          border-radius: 12px;
        }
        .dashboard-grid .react-grid-item.resizing {
          transition: none;
          z-index: 100;
        }
        .dashboard-grid .react-grid-placeholder {
          background: rgba(59, 130, 246, 0.12) !important;
          border: 2px dashed rgba(59, 130, 246, 0.35) !important;
          border-radius: 12px;
          transition: all 150ms ease;
        }
        .grid-item-wrapper {
          height: 100%;
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          overflow: hidden;
        }
        .grid-drag-handle {
          height: 6px;
          min-height: 6px;
          cursor: grab;
          background: transparent;
          transition: background 0.2s;
          border-radius: 12px 12px 0 0;
          flex-shrink: 0;
        }
        .grid-drag-handle:hover {
          background: rgba(255,255,255,0.08);
        }
        .grid-drag-handle:active {
          cursor: grabbing;
          background: rgba(59, 130, 246, 0.2);
        }
        .grid-item-content {
          flex: 1;
          min-height: 0;
          overflow: auto;
        }
        /* リサイズハンドル: 下端中央 (s) */
        .dashboard-grid .react-resizable-handle-s {
          position: absolute;
          width: 60px;
          height: 8px;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          cursor: ns-resize;
          z-index: 10;
        }
        .dashboard-grid .react-resizable-handle-s::after {
          content: '';
          position: absolute;
          left: 50%;
          bottom: 2px;
          transform: translateX(-50%);
          width: 32px;
          height: 3px;
          border-radius: 2px;
          background: rgba(255,255,255,0.1);
          transition: background 0.2s, width 0.2s;
        }
        .dashboard-grid .react-grid-item:hover .react-resizable-handle-s::after {
          background: rgba(255,255,255,0.3);
          width: 48px;
        }
        /* リサイズハンドル: 右下角 (se) */
        .dashboard-grid .react-resizable-handle-se {
          position: absolute;
          width: 16px;
          height: 16px;
          bottom: 0;
          right: 0;
          cursor: se-resize;
          z-index: 10;
        }
        .dashboard-grid .react-resizable-handle-se::after {
          content: '';
          position: absolute;
          right: 3px;
          bottom: 3px;
          width: 6px;
          height: 6px;
          border-right: 2px solid rgba(255,255,255,0.15);
          border-bottom: 2px solid rgba(255,255,255,0.15);
          transition: border-color 0.2s;
        }
        .dashboard-grid .react-grid-item:hover .react-resizable-handle-se::after {
          border-color: rgba(255,255,255,0.4);
        }
      `}</style>
    </div>
  );
}
