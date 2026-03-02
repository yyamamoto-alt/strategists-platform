"use client";

import { useState, useCallback } from "react";
import type { MarketingChannel, MappingRule } from "@/lib/marketing-attribution";
import type { AttributionStats } from "@/lib/data/marketing-settings";

// ================================================================
// Props & Types
// ================================================================

interface Props {
  initialChannels: MarketingChannel[];
  initialRules: MappingRule[];
  stats: AttributionStats;
}

type Tab = "channels" | "rules" | "overview";

const CATEGORIES = ["広告", "自然流入", "SNS", "コンテンツ", "紹介", "その他"];
const SOURCE_FIELDS = ["utm_source", "initial_channel", "application_reason", "sales_route"];
const MATCH_TYPES = ["exact", "contains", "prefix"] as const;

// ================================================================
// Component
// ================================================================

export function MarketingSettingsClient({ initialChannels, initialRules, stats }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("channels");
  const [channels, setChannels] = useState<MarketingChannel[]>(initialChannels);
  const [rules, setRules] = useState<MappingRule[]>(initialRules);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null);

  // ================================================================
  // チャネル CRUD
  // ================================================================

  const [newChannel, setNewChannel] = useState({ name: "", category: "その他", is_paid: false, priority: 100 });
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editChannelData, setEditChannelData] = useState<Partial<MarketingChannel>>({});

  const addChannel = useCallback(async () => {
    if (!newChannel.name.trim()) return;
    const res = await fetch("/api/marketing/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newChannel),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => [...prev, data]);
      setNewChannel({ name: "", category: "その他", is_paid: false, priority: 100 });
    }
  }, [newChannel]);

  const updateChannel = useCallback(async (id: string) => {
    const res = await fetch(`/api/marketing/channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editChannelData),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => prev.map((ch) => (ch.id === id ? data : ch)));
      setEditingChannelId(null);
      setEditChannelData({});
    }
  }, [editChannelData]);

  const deleteChannel = useCallback(async (id: string) => {
    if (!confirm("このチャネルを削除しますか？")) return;
    const res = await fetch(`/api/marketing/channels/${id}`, { method: "DELETE" });
    if (res.ok) {
      setChannels((prev) => prev.filter((ch) => ch.id !== id));
    }
  }, []);

  // ================================================================
  // ルール CRUD
  // ================================================================

  const [newRule, setNewRule] = useState({
    source_field: "utm_source",
    source_value: "",
    match_type: "exact" as "exact" | "contains" | "prefix",
    channel_name: "",
    notes: "",
    priority: 100,
  });
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editRuleData, setEditRuleData] = useState<Partial<MappingRule>>({});

  const addRule = useCallback(async () => {
    if (!newRule.source_value.trim() || !newRule.channel_name) return;
    const res = await fetch("/api/marketing/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRule),
    });
    if (res.ok) {
      const data = await res.json();
      setRules((prev) => [...prev, data]);
      setNewRule({ source_field: "utm_source", source_value: "", match_type: "exact", channel_name: "", notes: "", priority: 100 });
    }
  }, [newRule]);

  const updateRule = useCallback(async (id: string) => {
    const res = await fetch(`/api/marketing/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editRuleData),
    });
    if (res.ok) {
      const data = await res.json();
      setRules((prev) => prev.map((r) => (r.id === id ? data : r)));
      setEditingRuleId(null);
      setEditRuleData({});
    }
  }, [editRuleData]);

  const deleteRule = useCallback(async (id: string) => {
    if (!confirm("このルールを削除しますか？")) return;
    const res = await fetch(`/api/marketing/rules/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  }, []);

  // ================================================================
  // 再計算
  // ================================================================

  const recompute = useCallback(async () => {
    if (!confirm("全顧客のチャネル帰属を再計算しますか？\nこの処理には数秒かかります。")) return;
    setIsRecomputing(true);
    setRecomputeResult(null);
    try {
      const res = await fetch("/api/marketing/recompute", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRecomputeResult(`完了: ${data.processed}件処理 / ${data.total}件中 (エラー: ${data.errors}件)`);
      } else {
        setRecomputeResult(`エラー: ${data.error}`);
      }
    } catch {
      setRecomputeResult("ネットワークエラーが発生しました");
    } finally {
      setIsRecomputing(false);
    }
  }, []);

  // ================================================================
  // ルールフィルタ
  // ================================================================

  const [ruleFilter, setRuleFilter] = useState<string>("all");
  const filteredRules = ruleFilter === "all" ? rules : rules.filter((r) => r.source_field === ruleFilter);

  // ================================================================
  // Render
  // ================================================================

  const tabs: { key: Tab; label: string }[] = [
    { key: "channels", label: "チャネル管理" },
    { key: "rules", label: "マッピングルール" },
    { key: "overview", label: "ルール確認" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">マーケティング設定</h1>
        <p className="text-sm text-gray-500 mt-1">
          チャネル定義・マッピングルール・帰属計算の管理
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 bg-surface-card rounded-lg p-1 border border-white/10 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeTab === tab.key
                ? "bg-brand text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* タブ1: チャネル管理 */}
      {activeTab === "channels" && (
        <div className="space-y-4">
          <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">チャネル名</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">カテゴリ</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">有料</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">表示順</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">有効</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr key={ch.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    {editingChannelId === ch.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editChannelData.name ?? ch.name}
                            onChange={(e) => setEditChannelData((prev) => ({ ...prev, name: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-full"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={editChannelData.category ?? ch.category}
                            onChange={(e) => setEditChannelData((prev) => ({ ...prev, category: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                          >
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={editChannelData.is_paid ?? ch.is_paid}
                            onChange={(e) => setEditChannelData((prev) => ({ ...prev, is_paid: e.target.checked }))}
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number"
                            value={editChannelData.priority ?? ch.priority}
                            onChange={(e) => setEditChannelData((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-16 text-center"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={editChannelData.is_active ?? ch.is_active}
                            onChange={(e) => setEditChannelData((prev) => ({ ...prev, is_active: e.target.checked }))}
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => updateChannel(ch.id)} className="px-2 py-1 bg-brand/80 hover:bg-brand text-white rounded text-xs">保存</button>
                            <button onClick={() => { setEditingChannelId(null); setEditChannelData({}); }} className="px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs">取消</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-white">{ch.name}</td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-300">{ch.category}</span>
                        </td>
                        <td className="px-4 py-2 text-center text-gray-300">{ch.is_paid ? "有料" : "-"}</td>
                        <td className="px-4 py-2 text-center text-gray-400">{ch.priority}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-xs ${ch.is_active ? "text-green-400" : "text-red-400"}`}>
                            {ch.is_active ? "有効" : "無効"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => { setEditingChannelId(ch.id); setEditChannelData({}); }}
                              className="px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => deleteChannel(ch.id)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {/* 新規追加行 */}
                <tr className="border-t border-white/10 bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="チャネル名"
                      value={newChannel.name}
                      onChange={(e) => setNewChannel((prev) => ({ ...prev, name: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-full placeholder-gray-600"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={newChannel.category}
                      onChange={(e) => setNewChannel((prev) => ({ ...prev, category: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                    >
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={newChannel.is_paid}
                      onChange={(e) => setNewChannel((prev) => ({ ...prev, is_paid: e.target.checked }))}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      value={newChannel.priority}
                      onChange={(e) => setNewChannel((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-16 text-center"
                    />
                  </td>
                  <td />
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={addChannel}
                      disabled={!newChannel.name.trim()}
                      className="px-3 py-1 bg-brand/80 hover:bg-brand text-white rounded text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      + 追加
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* タブ2: マッピングルール */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          {/* フィルタ + 再計算ボタン */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <select
                value={ruleFilter}
                onChange={(e) => setRuleFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-white text-sm"
              >
                <option value="all">全てのソース</option>
                {SOURCE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <span className="text-sm text-gray-500 self-center">{filteredRules.length} ルール</span>
            </div>
            <button
              onClick={recompute}
              disabled={isRecomputing}
              className="px-4 py-2 bg-brand hover:bg-brand/80 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRecomputing ? "計算中..." : "全顧客を再計算"}
            </button>
          </div>

          {recomputeResult && (
            <div className={`px-4 py-2 rounded-lg text-sm ${
              recomputeResult.startsWith("完了") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>
              {recomputeResult}
            </div>
          )}

          <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">ソース</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">元の値</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">マッチ</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">変換先</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">メモ</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">優先度</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    {editingRuleId === r.id ? (
                      <>
                        <td className="px-4 py-2">
                          <select
                            value={editRuleData.source_field ?? r.source_field}
                            onChange={(e) => setEditRuleData((prev) => ({ ...prev, source_field: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                          >
                            {SOURCE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editRuleData.source_value ?? r.source_value}
                            onChange={(e) => setEditRuleData((prev) => ({ ...prev, source_value: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-full"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <select
                            value={editRuleData.match_type ?? r.match_type}
                            onChange={(e) => setEditRuleData((prev) => ({ ...prev, match_type: e.target.value as "exact" | "contains" | "prefix" }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                          >
                            {MATCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={editRuleData.channel_name ?? r.channel_name}
                            onChange={(e) => setEditRuleData((prev) => ({ ...prev, channel_name: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                          >
                            <option value="">選択...</option>
                            {channels.map((ch) => <option key={ch.id} value={ch.name}>{ch.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editRuleData.notes ?? r.notes ?? ""}
                            onChange={(e) => setEditRuleData((prev) => ({ ...prev, notes: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-full"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number"
                            value={editRuleData.priority ?? r.priority}
                            onChange={(e) => setEditRuleData((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-16 text-center"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => updateRule(r.id)} className="px-2 py-1 bg-brand/80 hover:bg-brand text-white rounded text-xs">保存</button>
                            <button onClick={() => { setEditingRuleId(null); setEditRuleData({}); }} className="px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs">取消</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400">{r.source_field}</span>
                        </td>
                        <td className="px-4 py-2 text-white font-mono text-xs">{r.source_value}</td>
                        <td className="px-4 py-2 text-center">
                          <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-gray-300">{r.match_type}</span>
                        </td>
                        <td className="px-4 py-2 text-white">{r.channel_name}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs max-w-[200px] truncate">{r.notes || "-"}</td>
                        <td className="px-4 py-2 text-center text-gray-400">{r.priority}</td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => { setEditingRuleId(r.id); setEditRuleData({}); }}
                              className="px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => deleteRule(r.id)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {/* 新規追加行 */}
                <tr className="border-t border-white/10 bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <select
                      value={newRule.source_field}
                      onChange={(e) => setNewRule((prev) => ({ ...prev, source_field: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                    >
                      {SOURCE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="マッチ対象値"
                      value={newRule.source_value}
                      onChange={(e) => setNewRule((prev) => ({ ...prev, source_value: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-full placeholder-gray-600"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <select
                      value={newRule.match_type}
                      onChange={(e) => setNewRule((prev) => ({ ...prev, match_type: e.target.value as "exact" | "contains" | "prefix" }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                    >
                      {MATCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={newRule.channel_name}
                      onChange={(e) => setNewRule((prev) => ({ ...prev, channel_name: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                    >
                      <option value="">選択...</option>
                      {channels.map((ch) => <option key={ch.id} value={ch.name}>{ch.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="メモ"
                      value={newRule.notes}
                      onChange={(e) => setNewRule((prev) => ({ ...prev, notes: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-full placeholder-gray-600"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      value={newRule.priority}
                      onChange={(e) => setNewRule((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm w-16 text-center"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={addRule}
                      disabled={!newRule.source_value.trim() || !newRule.channel_name}
                      className="px-3 py-1 bg-brand/80 hover:bg-brand text-white rounded text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      + 追加
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* タブ3: ルール確認 (読み取り専用) */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* 帰属統計 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="帰属済み" value={stats.attributedCount} sub={`/ ${stats.totalCustomers} 顧客`} color="text-green-400" />
            <StatCard label="不明" value={stats.unknownCount} sub={`${stats.totalCustomers > 0 ? Math.round(stats.unknownCount / stats.totalCustomers * 100) : 0}%`} color="text-yellow-400" />
            <StatCard label="高信頼" value={stats.highConfidence} sub="high confidence" color="text-blue-400" />
            <StatCard label="中信頼" value={stats.mediumConfidence} sub="medium confidence" color="text-gray-400" />
          </div>

          {/* 帰属ルールの可視化 */}
          <div className="space-y-4">
            <RuleGroup
              title="1. UTMパラメータ (最優先)"
              description="utm_source パラメータをマッピングルールでチャネルに変換。広告チャネルの場合は最優先 (high confidence)。"
              rules={rules.filter((r) => r.source_field === "utm_source")}
            />
            <RuleGroup
              title="2. 初回認知経路"
              description="initial_channel フィールドをマッピング。UTMがない場合に使用 (medium confidence)。"
              rules={rules.filter((r) => r.source_field === "initial_channel")}
            />
            <RuleGroup
              title="3. 申込理由"
              description="application_reason の自由テキストから部分一致でチャネルを推定 (low confidence)。"
              rules={rules.filter((r) => r.source_field === "application_reason")}
            />
            <RuleGroup
              title="4. 営業ルート"
              description="sales_route フィールドをマッピング (low confidence)。"
              rules={rules.filter((r) => r.source_field === "sales_route")}
            />
            <div className="bg-surface-card rounded-xl border border-white/10 p-4">
              <h3 className="text-white font-medium mb-2">5. フォールバック</h3>
              <p className="text-sm text-gray-400">上記のルールに一致しない場合、生の値をそのまま使用。全てのフィールドが空の場合は「不明」に帰属。</p>
            </div>
          </div>

          {/* チャネル別帰属分布 */}
          {stats.byChannel.length > 0 && (
            <div className="bg-surface-card rounded-xl border border-white/10 p-4">
              <h3 className="text-white font-medium mb-4">チャネル別帰属分布</h3>
              <div className="space-y-2">
                {stats.byChannel.map((item) => {
                  const pct = stats.totalCustomers > 0 ? (item.count / stats.totalCustomers) * 100 : 0;
                  return (
                    <div key={item.channel} className="flex items-center gap-3">
                      <span className="text-sm text-gray-300 w-32 truncate">{item.channel}</span>
                      <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand/60 rounded-full"
                          style={{ width: `${Math.max(1, pct)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-20 text-right">{item.count}件 ({pct.toFixed(1)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// Sub Components
// ================================================================

function StatCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className="bg-surface-card rounded-xl border border-white/10 p-4">
      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function RuleGroup({ title, description, rules }: { title: string; description: string; rules: MappingRule[] }) {
  return (
    <div className="bg-surface-card rounded-xl border border-white/10 p-4">
      <h3 className="text-white font-medium mb-1">{title}</h3>
      <p className="text-sm text-gray-400 mb-3">{description}</p>
      {rules.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <span className="text-xs font-mono text-gray-400">{r.source_value}</span>
              <span className="text-gray-600">→</span>
              <span className="text-xs text-white font-medium">{r.channel_name}</span>
              <span className="text-[10px] text-gray-600 ml-auto">{r.match_type}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600">ルールなし</p>
      )}
    </div>
  );
}
