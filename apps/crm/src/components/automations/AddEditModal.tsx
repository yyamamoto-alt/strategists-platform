"use client";

import { useState } from "react";
import type { Automation, SlackChannel } from "./shared";

export function AddEditModal({
  automation,
  channels,
  loadingChannels,
  onClose,
  onSaved,
}: {
  automation?: Automation;
  channels: SlackChannel[];
  loadingChannels: boolean;
  onClose: () => void;
  onSaved: (a: Automation) => void;
}) {
  const isEdit = !!automation;
  const [name, setName] = useState(automation?.name || "");
  const [spreadsheetId, setSpreadsheetId] = useState(
    automation?.spreadsheet_id || ""
  );
  const [sheetName, setSheetName] = useState(automation?.sheet_name || "");
  const [slackChannelId, setSlackChannelId] = useState(
    automation?.slack_channel_id || ""
  );
  const [messageTemplate, setMessageTemplate] = useState(
    automation?.message_template || ""
  );
  const [linkToCustomer, setLinkToCustomer] = useState(
    automation?.link_to_customer || false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedChannelName =
    channels.find((c) => c.id === slackChannelId)?.name || "";

  const handleSave = async () => {
    if (!name.trim() || !spreadsheetId.trim() || !slackChannelId) {
      setError("連携名、スプレッドシートID/URL、通知先チャンネルは必須です");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const payload = {
        name: name.trim(),
        spreadsheet_id: spreadsheetId.trim(),
        sheet_name: sheetName.trim() || "Sheet1",
        slack_channel_id: slackChannelId,
        slack_channel_name: selectedChannelName,
        message_template: messageTemplate.trim() || null,
        link_to_customer: linkToCustomer,
      };

      const url = isEdit
        ? `/api/automations/${automation.id}`
        : "/api/automations";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "保存に失敗しました");
        return;
      }

      const saved = await res.json();
      onSaved(saved);
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold text-white mb-4">
          {isEdit ? "連携を編集" : "新規連携を追加"}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">連携名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 面接振り返り通知"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              スプレッドシートURL or ID
            </label>
            <input
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/... or ID"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              ※ サービスアカウント (strategists-sheets-reader@...) に閲覧権限を付与してください
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">シート名</label>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Sheet1（デフォルト）"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              通知先Slackチャンネル
            </label>
            {loadingChannels ? (
              <p className="text-xs text-gray-500">チャンネル一覧を読み込み中...</p>
            ) : (
              <select
                value={slackChannelId}
                onChange={(e) => setSlackChannelId(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">選択してください</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              通知テンプレート（任意）
            </label>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder={"空欄の場合、全フィールドをそのまま表示します。\n例: *{{名前}}* さんが面接振り返りを提出しました\n評価: {{総合評価}}"}
              rows={4}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              {"{{ヘッダー名}}"} でシートのカラム値を挿入できます
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="linkToCustomer"
              checked={linkToCustomer}
              onChange={(e) => setLinkToCustomer(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="linkToCustomer" className="text-sm text-gray-300">
              顧客DBに紐付ける
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? "保存中..." : isEdit ? "更新" : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}
