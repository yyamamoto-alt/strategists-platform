"use client";

import { useState } from "react";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* デスクトップサイドバー */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* モバイルサイドバー（オーバーレイ） */}
      <MobileSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* モバイルヘッダー */}
        <header className="flex items-center h-14 px-4 border-b border-white/10 bg-surface-raised-lms lg:hidden shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand rounded-md"
            aria-label="メニューを開く"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="flex-1 flex justify-center">
            <span className="text-sm font-semibold text-white tracking-wide">
              Strategists LMS
            </span>
          </div>
          {/* 右側のバランス用スペーサー */}
          <div className="w-10" />
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
