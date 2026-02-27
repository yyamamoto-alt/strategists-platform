"use client";

import { mockApplications } from "@/lib/mock-data";
import { FileCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const statusBadges: Record<string, string> = {
  pending: "bg-yellow-900/50 text-yellow-300", approved: "bg-green-900/50 text-green-300", rejected: "bg-red-900/50 text-red-300",
};
const statusLabels: Record<string, string> = {
  pending: "審査中", approved: "承認済", rejected: "却下",
};

export default function ApplicationsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="p-6 bg-gray-950 min-h-screen">
      <div className="mb-6"><h1 className="text-2xl font-bold text-white">入塾申請</h1><p className="text-sm text-gray-400 mt-1">入塾申請の管理・承認</p></div>
      <div className="space-y-3">
        {mockApplications.map((app) => {
          const isExpanded = expandedId === app.id;
          return (
            <div key={app.id} className="bg-gray-800 rounded-xl overflow-hidden">
              <button onClick={() => setExpandedId(isExpanded ? null : app.id)} className="w-full p-4 text-left flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-sm font-bold text-white">{app.name[0]}</div>
                  <div><p className="text-sm text-white font-medium">{app.name}</p><p className="text-xs text-gray-400">{app.email}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadges[app.status] || "bg-gray-700 text-gray-300"}`}>{statusLabels[app.status] || app.status}</span>
                  <span className="text-xs text-gray-500">{new Date(app.created_at).toLocaleDateString("ja-JP")}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-700 pt-4 space-y-3">
                  {app.motivation && <div><p className="text-xs text-gray-500 mb-1">志望動機</p><p className="text-sm text-gray-300">{app.motivation}</p></div>}
                  {app.experience && <div><p className="text-xs text-gray-500 mb-1">経験</p><p className="text-sm text-gray-300">{app.experience}</p></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
