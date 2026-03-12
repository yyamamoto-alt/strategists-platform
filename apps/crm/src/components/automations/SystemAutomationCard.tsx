"use client";

import type { SystemAutomation } from "./shared";
import { CategoryBadge, SystemAutomationFlow, ClockIcon } from "./shared";

export function SystemAutomationCard({ automation, isEnabled, onToggle }: { automation: SystemAutomation; isEnabled: boolean; onToggle: () => void }) {
  return (
    <div className={`bg-surface-raised border rounded-lg overflow-hidden transition-colors ${
      isEnabled ? "border-white/10" : "border-white/5 opacity-60"
    }`}>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white font-medium">{automation.name}</span>
              <CategoryBadge category={automation.category} />
              <button
                onClick={onToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isEnabled ? "bg-green-600" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    isEnabled ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <SystemAutomationFlow automation={automation} />

            <p className="text-xs text-gray-500 mt-2">
              {automation.description}
            </p>
            {automation.schedule && (
              <p className="text-xs text-gray-600 mt-1">
                <ClockIcon className="w-3 h-3 inline mr-1" />
                スケジュール: {automation.schedule}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1.5 text-xs text-gray-500 bg-gray-800/50 rounded">
              システム管理
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
