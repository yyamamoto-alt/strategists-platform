"use client";

import { ClipboardList } from "lucide-react";

export default function AssignmentsLmsPage() {
  return (
    <div className="min-h-screen bg-surface text-white p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-7 w-7 text-brand-light" />
        <div>
          <h1 className="text-2xl font-bold">課題管理</h1>
          <p className="text-sm text-gray-400 mt-1">課題の提出状況とフィードバック</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["未提出", "提出済", "レビュー中", "フィードバック済"] as const).map((status) => (
          <div key={status} className="bg-surface-card border border-white/10 rounded-lg p-4">
            <p className="text-xs text-gray-400">{status}</p>
            <p className="text-2xl font-bold mt-1">0</p>
          </div>
        ))}
      </div>
      <div className="text-center py-12 bg-surface-card border border-white/10 rounded-lg">
        <ClipboardList className="h-12 w-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">モックモードでは課題データは表示されません</p>
      </div>
    </div>
  );
}
