"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { mockCustomers } from "@/lib/mock-data";
import {
  formatDate,
  formatCurrency,
  getStageColor,
  getAttributeColor,
  getDealStatusColor,
} from "@/lib/utils";
import { CustomerAttribute, PipelineStage } from "@/types/database";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [attributeFilter, setAttributeFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("application_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let result = [...mockCustomers];

    // 検索
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.university?.toLowerCase().includes(q) ||
          c.career_history?.toLowerCase().includes(q)
      );
    }

    // 属性フィルタ
    if (attributeFilter) {
      result = result.filter((c) => c.attribute === attributeFilter);
    }

    // ステージフィルタ
    if (stageFilter) {
      result = result.filter((c) => c.pipeline?.stage === stageFilter);
    }

    // ソート
    result.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortBy) {
        case "application_date":
          aVal = a.application_date || "";
          bVal = b.application_date || "";
          break;
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "amount":
          aVal = a.contract?.confirmed_amount || 0;
          bVal = b.contract?.confirmed_amount || 0;
          break;
      }

      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [search, attributeFilter, stageFilter, sortBy, sortDir]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">顧客一覧</h1>
          <p className="text-sm text-gray-500 mt-1">
            全{filtered.length}件の顧客
          </p>
        </div>
        <button className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
          + 新規顧客登録
        </button>
      </div>

      {/* フィルタ・検索 */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="名前・メール・電話・大学で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={attributeFilter}
            onChange={(e) => setAttributeFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">全属性</option>
            <option value="既卒">既卒</option>
            <option value="新卒">新卒</option>
          </select>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">全ステージ</option>
            <option value="問い合わせ">問い合わせ</option>
            <option value="日程確定">日程確定</option>
            <option value="面談実施">面談実施</option>
            <option value="提案中">提案中</option>
            <option value="成約">成約</option>
            <option value="入金済">入金済</option>
            <option value="失注">失注</option>
            <option value="保留">保留</option>
          </select>
          <select
            value={`${sortBy}-${sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split("-");
              setSortBy(by);
              setSortDir(dir as "asc" | "desc");
            }}
            className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="application_date-desc">申込日 (新しい順)</option>
            <option value="application_date-asc">申込日 (古い順)</option>
            <option value="name-asc">名前 (A-Z)</option>
            <option value="amount-desc">金額 (大きい順)</option>
          </select>
        </div>
      </div>

      {/* 顧客テーブル */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                  顧客
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                  属性
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                  流入元
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                  ステージ
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                  商談状況
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                  契約金額
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                  申込日
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="py-3 px-4">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="w-9 h-9 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                        {customer.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-sm group-hover:text-primary-600 transition-colors">
                          {customer.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {customer.email || "-"}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(
                        customer.attribute
                      )}`}
                    >
                      {customer.attribute}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {customer.utm_source || "-"}
                  </td>
                  <td className="py-3 px-4">
                    {customer.pipeline && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(
                          customer.pipeline.stage
                        )}`}
                      >
                        {customer.pipeline.stage}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {customer.pipeline && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(
                          customer.pipeline.deal_status
                        )}`}
                      >
                        {customer.pipeline.deal_status}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-medium">
                    {customer.contract?.confirmed_amount
                      ? formatCurrency(customer.contract.confirmed_amount)
                      : "-"}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {formatDate(customer.application_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
