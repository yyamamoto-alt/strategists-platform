"use client";

import { Users } from "lucide-react";

export default function StudentsPage() {
  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="mb-6"><h1 className="text-2xl font-bold text-white">受講生管理</h1><p className="text-sm text-gray-400 mt-1">受講生の一覧と管理</p></div>
      <div className="text-center py-12 text-gray-400"><Users className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>モックモードでは受講生データは表示されません</p></div>
    </div>
  );
}
