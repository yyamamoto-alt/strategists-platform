"use client";

import { CostChart } from "@/components/dashboard/cost-chart";

export function CostSection() {
  return (
    <div className="px-6">
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">コスト推移（freee）</h2>
        <CostChart />
      </div>
    </div>
  );
}
