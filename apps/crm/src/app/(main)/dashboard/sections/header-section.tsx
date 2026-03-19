import { fetchDashboardData } from "@/lib/data/dashboard-metrics";

export async function HeaderSection() {
  const dashboardData = await fetchDashboardData();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            {dashboardData.totalCustomers}顧客 / 成約 {dashboardData.closedCount}件
          </p>
        </div>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleDateString("ja-JP")}
        </div>
      </div>
    </div>
  );
}
