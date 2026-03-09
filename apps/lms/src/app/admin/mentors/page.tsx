"use client";

import { useEffect, useState } from "react";

interface Mentor {
  id: string;
  name: string;
  slack_user_id: string | null;
  booking_url: string | null;
  line_url: string | null;
  profile_text: string | null;
  is_active: boolean;
}

interface ParsedMentor {
  name: string;
  line_url: string | null;
  booking_url: string | null;
  profile_text: string | null;
  checked: boolean;
}

export default function MentorsAdminPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Mentor>>({});
  const [saving, setSaving] = useState(false);

  // New mentor form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({
    name: "",
    slack_user_id: "",
    line_url: "",
    booking_url: "",
    profile_text: "",
  });
  const [savingNew, setSavingNew] = useState(false);

  // Bulk import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedMentors, setParsedMentors] = useState<ParsedMentor[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const fetchMentors = async () => {
    const res = await fetch("/api/admin/mentors");
    if (res.ok) {
      const data = await res.json();
      setMentors(data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchMentors(); }, []);

  const startEdit = (m: Mentor) => {
    setEditingId(m.id);
    setForm({ ...m });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch(`/api/admin/mentors/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setEditingId(null);
      setForm({});
      await fetchMentors();
    }
    setSaving(false);
  };

  // New mentor
  const saveNewMentor = async () => {
    if (!newForm.name.trim()) return;
    setSavingNew(true);
    const res = await fetch("/api/admin/mentors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newForm.name,
        slack_user_id: newForm.slack_user_id || null,
        line_url: newForm.line_url || null,
        booking_url: newForm.booking_url || null,
        profile_text: newForm.profile_text || null,
      }),
    });
    if (res.ok) {
      setNewForm({ name: "", slack_user_id: "", line_url: "", booking_url: "", profile_text: "" });
      setShowNewForm(false);
      await fetchMentors();
    }
    setSavingNew(false);
  };

  // Bulk import: parse
  const handleParse = async () => {
    if (!importText.trim()) return;
    setParsing(true);
    setParsedMentors([]);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/mentors/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText }),
      });
      const data = await res.json();
      if (res.ok && data.mentors) {
        setParsedMentors(
          data.mentors.map((m: Omit<ParsedMentor, "checked">) => ({ ...m, checked: true }))
        );
      } else {
        setImportResult(data.error || "解析に失敗しました");
      }
    } catch {
      setImportResult("解析中にエラーが発生しました");
    }
    setParsing(false);
  };

  // Bulk import: register
  const handleBulkRegister = async () => {
    const selected = parsedMentors.filter((m) => m.checked);
    if (selected.length === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentors: selected.map(({ name, line_url, booking_url, profile_text }) => ({
            name,
            line_url,
            booking_url,
            profile_text,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(`${data.count}名のメンターを登録しました`);
        setParsedMentors([]);
        setImportText("");
        await fetchMentors();
      } else {
        setImportResult(data.error || "登録に失敗しました");
      }
    } catch {
      setImportResult("登録中にエラーが発生しました");
    }
    setImporting(false);
  };

  const toggleParsedMentor = (idx: number) => {
    setParsedMentors((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, checked: !m.checked } : m))
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-surface min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">メンター管理</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{mentors.length} 名</span>
          <button
            onClick={() => { setShowNewForm(!showNewForm); }}
            className="px-3 py-1.5 text-xs bg-red-700 hover:bg-red-600 text-white rounded-lg"
          >
            + 新規メンター追加
          </button>
        </div>
      </div>

      {/* New Mentor Form */}
      {showNewForm && (
        <div className="border border-white/10 rounded-lg bg-surface-elevated p-4 mb-6">
          <h2 className="text-sm font-medium text-white mb-3">新規メンター追加</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">ニックネーム *</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                placeholder="例: 山田太郎"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Slack ユーザーID</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                value={newForm.slack_user_id}
                onChange={(e) => setNewForm({ ...newForm, slack_user_id: e.target.value })}
                placeholder="U01XXXXXXXX"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400 block mb-1">LINE友達追加URL</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                value={newForm.line_url}
                onChange={(e) => setNewForm({ ...newForm, line_url: e.target.value })}
                placeholder="https://line.me/ti/p/..."
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400 block mb-1">予約URL</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                value={newForm.booking_url}
                onChange={(e) => setNewForm({ ...newForm, booking_url: e.target.value })}
                placeholder="https://calendly.com/..."
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400 block mb-1">プロフィール / メモ</label>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white min-h-[80px]"
                value={newForm.profile_text}
                onChange={(e) => setNewForm({ ...newForm, profile_text: e.target.value })}
                placeholder="受講生向けの紹介文やメモ"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-3">
            <button
              onClick={saveNewMentor}
              disabled={savingNew || !newForm.name.trim()}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {savingNew ? "保存中..." : "追加する"}
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 text-sm rounded-lg"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Mentor List */}
      <div className="space-y-3">
        {mentors.map((m) => (
          <div key={m.id} className="border border-white/10 rounded-lg bg-surface-elevated p-4">
            {editingId === m.id ? (
              // 編集モード
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">ニックネーム</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Slack ユーザーID</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.slack_user_id || ""}
                      onChange={(e) => setForm({ ...form, slack_user_id: e.target.value })}
                      placeholder="U01XXXXXXXX"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 block mb-1">LINE友達追加URL</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.line_url || ""}
                      onChange={(e) => setForm({ ...form, line_url: e.target.value })}
                      placeholder="https://line.me/ti/p/..."
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 block mb-1">予約URL</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.booking_url || ""}
                      onChange={(e) => setForm({ ...form, booking_url: e.target.value })}
                      placeholder="https://calendly.com/..."
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 block mb-1">プロフィール / メモ</label>
                    <textarea
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white min-h-[80px]"
                      value={form.profile_text || ""}
                      onChange={(e) => setForm({ ...form, profile_text: e.target.value })}
                      placeholder="受講生向けの紹介文やメモ"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.is_active ?? true}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="rounded"
                    />
                    アクティブ
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 text-sm rounded-lg"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              // 表示モード
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{m.name}</span>
                    {!m.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-600 text-gray-300 rounded">非アクティブ</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    {m.slack_user_id && <span>Slack: {m.slack_user_id}</span>}
                    {m.line_url && (
                      <a href={m.line_url} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
                        LINE
                      </a>
                    )}
                    {m.booking_url && (
                      <a href={m.booking_url} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">
                        予約URL
                      </a>
                    )}
                  </div>
                  {m.profile_text && (
                    <p className="text-xs text-gray-500 mt-1">{m.profile_text}</p>
                  )}
                  {!m.line_url && !m.booking_url && (
                    <p className="text-xs text-yellow-500/70">未設定 - 編集して連絡先を追加してください</p>
                  )}
                </div>
                <button
                  onClick={() => startEdit(m)}
                  className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg shrink-0"
                >
                  編集
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bulk Import Section */}
      <div className="mt-8 border-t border-white/5 pt-6">
        <button
          onClick={() => {
            setShowImport(!showImport);
            if (!showImport) {
              setImportResult(null);
              setParsedMentors([]);
            }
          }}
          className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          {showImport ? "- 一括インポートを閉じる" : "+ 一括インポート"}
        </button>

        {showImport && (
          <div className="mt-4 border border-white/10 rounded-lg bg-surface-elevated p-4 space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-2">
                メンターのテンプレートテキストをまとめて貼り付けてください
              </label>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white min-h-[200px] font-mono"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`例:\n担当メンター: 山田太郎\nLINE: https://line.me/ti/p/xxxxx\n予約: https://calendly.com/yamada\n...\n\n担当メンター: 鈴木花子\nLINE: https://line.me/ti/p/yyyyy\n...`}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleParse}
                disabled={parsing || !importText.trim()}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {parsing && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {parsing ? "AI解析中..." : "解析する"}
              </button>
              {parsing && (
                <span className="text-xs text-gray-500">Claude APIでテキストを解析しています...</span>
              )}
            </div>

            {/* Import result message */}
            {importResult && (
              <div
                className={`text-sm px-3 py-2 rounded ${
                  importResult.includes("登録しました")
                    ? "bg-green-900/30 text-green-400 border border-green-500/20"
                    : "bg-red-900/30 text-red-400 border border-red-500/20"
                }`}
              >
                {importResult}
              </div>
            )}

            {/* Parsed mentors preview */}
            {parsedMentors.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-white">
                  解析結果 ({parsedMentors.filter((m) => m.checked).length}/{parsedMentors.length} 名選択中)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-white/10">
                        <th className="text-left py-2 px-2 w-8"></th>
                        <th className="text-left py-2 px-2">ニックネーム</th>
                        <th className="text-left py-2 px-2">LINE URL</th>
                        <th className="text-left py-2 px-2">予約URL</th>
                        <th className="text-left py-2 px-2">プロフィール</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedMentors.map((m, idx) => (
                        <tr
                          key={idx}
                          className={`border-b border-white/5 ${m.checked ? "" : "opacity-40"}`}
                        >
                          <td className="py-2 px-2">
                            <input
                              type="checkbox"
                              checked={m.checked}
                              onChange={() => toggleParsedMentor(idx)}
                              className="rounded"
                            />
                          </td>
                          <td className="py-2 px-2 text-white font-medium">{m.name || "-"}</td>
                          <td className="py-2 px-2">
                            {m.line_url ? (
                              <a
                                href={m.line_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-400 hover:underline truncate block max-w-[200px]"
                              >
                                {m.line_url}
                              </a>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            {m.booking_url ? (
                              <a
                                href={m.booking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-400 hover:underline truncate block max-w-[200px]"
                              >
                                {m.booking_url}
                              </a>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-gray-400 max-w-[300px] truncate">
                            {m.profile_text || <span className="text-gray-600">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleBulkRegister}
                    disabled={importing || parsedMentors.filter((m) => m.checked).length === 0}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg disabled:opacity-50 flex items-center gap-2"
                  >
                    {importing && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {importing
                      ? "登録中..."
                      : `${parsedMentors.filter((m) => m.checked).length}名を登録する`}
                  </button>
                  <button
                    onClick={() => setParsedMentors([])}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 text-sm rounded-lg"
                  >
                    クリア
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
