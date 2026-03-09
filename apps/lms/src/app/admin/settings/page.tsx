"use client";

import { useState, useEffect, useCallback } from "react";

interface Setting {
  key: string;
  value: unknown;
  description: string | null;
}

interface SlackChannel {
  id: string;
  name: string;
}

interface EmailTemplate {
  subject: string;
  greeting: string;
  body: string;
  mentorIntroTitle: string;
  mentorIntroPrefix: string;
  lineButtonText: string;
  bookingButtonText: string;
  fallbackContact: string;
  linkExpiry: string;
  linkFallback: string;
  ctaText: string;
}

interface DmTemplate {
  header: string;
  titleFormat: string;
  planLabel: string;
  contractLabel: string;
  sessionsLabel: string;
  startDateLabel: string;
  endDateLabel: string;
  emailLabel: string;
  sheetLinkText: string;
  closing: string;
}

const DEFAULT_EMAIL_TEMPLATE: EmailTemplate = {
  subject: "【Strategists {{appName}}】招待のご案内",
  greeting: "{{displayName}} 様",
  body: "Strategists {{appName}}に{{roleLabel}}として招待されました。\n以下のリンクからアカウントを作成してください。",
  mentorIntroTitle: "担当メンターのご紹介",
  mentorIntroPrefix: "担当メンター:",
  lineButtonText: "LINEで友達追加する",
  bookingButtonText: "初回面談を予約する",
  fallbackContact: "ご質問は support@akagiconsulting.com までお気軽にお問い合わせください。",
  linkExpiry: "このリンクの有効期限は発行から30日間です。",
  linkFallback: "もしリンクが機能しない場合は、以下のURLをブラウザに直接貼り付けてください：",
  ctaText: "アカウントを作成する",
};

const DEFAULT_DM_TEMPLATE: DmTemplate = {
  header: "新規受講生の指導依頼",
  titleFormat: "【指導依頼】{{studentName}} 様",
  planLabel: "プラン:",
  contractLabel: "契約期間:",
  sessionsLabel: "総指導回数:",
  startDateLabel: "指導開始日:",
  endDateLabel: "指導終了日:",
  emailLabel: "メール:",
  sheetLinkText: "プログレスシートを開く",
  closing: "よろしくお願いいたします。",
};

type TabId = "general" | "email" | "dm";

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  // Template states
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate>(DEFAULT_EMAIL_TEMPLATE);
  const [originalEmailTemplate, setOriginalEmailTemplate] = useState<EmailTemplate>(DEFAULT_EMAIL_TEMPLATE);
  const [dmTemplate, setDmTemplate] = useState<DmTemplate>(DEFAULT_DM_TEMPLATE);
  const [originalDmTemplate, setOriginalDmTemplate] = useState<DmTemplate>(DEFAULT_DM_TEMPLATE);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingDm, setSavingDm] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data: Setting[]) => {
        const map: Record<string, string> = {};
        for (const s of data) {
          if (s.key === "invite_email_template") {
            const tpl = typeof s.value === "string" ? JSON.parse(s.value) : s.value;
            setEmailTemplate({ ...DEFAULT_EMAIL_TEMPLATE, ...tpl });
            setOriginalEmailTemplate({ ...DEFAULT_EMAIL_TEMPLATE, ...tpl });
          } else if (s.key === "mentor_dm_template") {
            const tpl = typeof s.value === "string" ? JSON.parse(s.value) : s.value;
            setDmTemplate({ ...DEFAULT_DM_TEMPLATE, ...tpl });
            setOriginalDmTemplate({ ...DEFAULT_DM_TEMPLATE, ...tpl });
          } else {
            map[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
          }
        }
        setSettings(map);
        setOriginal(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/admin/slack-channels")
      .then((r) => r.json())
      .then((data: SlackChannel[]) => {
        if (Array.isArray(data)) setChannels(data);
      })
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, []);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const settingKeys = ["auto_invite_enabled", "auto_invite_slack_channel"];
  const hasChanges = settingKeys.some((k) => settings[k] !== original[k]);
  const hasEmailChanges = JSON.stringify(emailTemplate) !== JSON.stringify(originalEmailTemplate);
  const hasDmChanges = JSON.stringify(dmTemplate) !== JSON.stringify(originalDmTemplate);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);

    const updates = settingKeys
      .filter((k) => settings[k] !== original[k])
      .map((k) => ({ key: k, value: settings[k] }));

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) throw new Error("保存に失敗しました");

      setOriginal({ ...settings });
      showToast("success", "設定を保存しました");
    } catch {
      showToast("error", "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmailTemplate = async () => {
    setSavingEmail(true);
    setToast(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{ key: "invite_email_template", value: JSON.stringify(emailTemplate) }],
        }),
      });

      if (!res.ok) throw new Error("保存に失敗しました");

      setOriginalEmailTemplate({ ...emailTemplate });
      showToast("success", "メールテンプレートを保存しました");
    } catch {
      showToast("error", "メールテンプレートの保存に失敗しました");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveDmTemplate = async () => {
    setSavingDm(true);
    setToast(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{ key: "mentor_dm_template", value: JSON.stringify(dmTemplate) }],
        }),
      });

      if (!res.ok) throw new Error("保存に失敗しました");

      setOriginalDmTemplate({ ...dmTemplate });
      showToast("success", "DMテンプレートを保存しました");
    } catch {
      showToast("error", "DMテンプレートの保存に失敗しました");
    } finally {
      setSavingDm(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-surface min-h-screen">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  const toggleValue = settings["auto_invite_enabled"] || "";
  const toggleChanged = toggleValue !== (original["auto_invite_enabled"] || "");
  const channelValue = (settings["auto_invite_slack_channel"] || "").replace(/"/g, "");
  const channelChanged = channelValue !== (original["auto_invite_slack_channel"] || "").replace(/"/g, "");

  const tabs: { id: TabId; label: string; badge?: boolean }[] = [
    { id: "general", label: "一般設定" },
    { id: "email", label: "招待メール文面", badge: hasEmailChanges },
    { id: "dm", label: "メンターDM文面", badge: hasDmChanges },
  ];

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">LMS設定</h1>
          <p className="text-sm text-gray-400 mt-1">自動招待・通知・テンプレートの設定を管理します</p>
        </div>

        {toast && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            toast.type === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}>
            {toast.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-white/10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? "text-white border-b-2 border-brand"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
              {tab.badge && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          ))}
        </div>

        {/* General Settings Tab */}
        {activeTab === "general" && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
                  hasChanges && !saving
                    ? "bg-brand text-white hover:bg-brand-dark"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>

            <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">自動招待</h2>
                <p className="text-xs text-gray-500 mt-1">
                  入塾フォーム → Slack承認 → 招待メール送信の自動化設定
                </p>
              </div>
              <div className="divide-y divide-white/5">
                {/* 自動招待トグル */}
                <div className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium text-gray-200">
                      自動招待を有効にする
                      {toggleChanged && (
                        <span className="ml-2 text-xs text-amber-400">(変更あり)</span>
                      )}
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      入塾フォーム受付時にSlack承認→自動でLMS招待メールを送信します
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleChange("auto_invite_enabled", toggleValue === "true" ? "false" : "true")}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      toggleValue === "true" ? "bg-brand" : "bg-gray-600"
                    } ${toggleChanged ? "ring-2 ring-amber-500/50" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        toggleValue === "true" ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Slackチャンネル選択 */}
                <div className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium text-gray-200">
                      Slack通知チャンネル
                      {channelChanged && (
                        <span className="ml-2 text-xs text-amber-400">(変更あり)</span>
                      )}
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      承認リクエストを送信するSlackチャンネル
                    </p>
                  </div>
                  <div>
                    {channelsLoading ? (
                      <div className="w-52 px-3 py-2 text-sm text-gray-500 bg-surface-elevated border border-white/10 rounded-lg">
                        読み込み中...
                      </div>
                    ) : channels.length === 0 ? (
                      <div className="w-52 px-3 py-2 text-sm text-red-400 bg-surface-elevated border border-red-500/20 rounded-lg">
                        チャンネル取得失敗
                      </div>
                    ) : (
                      <select
                        value={channelValue}
                        onChange={(e) => handleChange("auto_invite_slack_channel", e.target.value)}
                        className={`w-52 px-3 py-2 text-sm rounded-lg border bg-surface-elevated text-white focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                          channelChanged ? "border-amber-500/50" : "border-white/10"
                        }`}
                      >
                        <option value="" className="bg-gray-800">選択してください</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={`#${ch.name}`} className="bg-gray-800">
                            #{ch.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email Template Tab */}
        {activeTab === "email" && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={handleSaveEmailTemplate}
                disabled={!hasEmailChanges || savingEmail}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
                  hasEmailChanges && !savingEmail
                    ? "bg-brand text-white hover:bg-brand-dark"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                {savingEmail ? "保存中..." : "保存"}
              </button>
            </div>

            <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">招待メールテンプレート</h2>
                <p className="text-xs text-gray-500 mt-1">
                  受講生への招待メール文面を編集します。{`{{appName}}`}, {`{{displayName}}`}, {`{{roleLabel}}`} が変数として使用できます。
                </p>
              </div>
              <div className="divide-y divide-white/5">
                <TemplateField
                  label="件名"
                  value={emailTemplate.subject}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, subject: v }))}
                  original={originalEmailTemplate.subject}
                  placeholder="【Strategists {{appName}}】招待のご案内"
                />
                <TemplateField
                  label="挨拶文"
                  value={emailTemplate.greeting}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, greeting: v }))}
                  original={originalEmailTemplate.greeting}
                  placeholder="{{displayName}} 様"
                  hint="{{displayName}} = 受講生の名前"
                />
                <TemplateField
                  label="本文"
                  value={emailTemplate.body}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, body: v }))}
                  original={originalEmailTemplate.body}
                  multiline
                  placeholder="Strategists {{appName}}に{{roleLabel}}として招待されました。"
                />
                <TemplateField
                  label="CTAボタンテキスト"
                  value={emailTemplate.ctaText}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, ctaText: v }))}
                  original={originalEmailTemplate.ctaText}
                  placeholder="アカウントを作成する"
                />
                <TemplateField
                  label="メンター紹介タイトル"
                  value={emailTemplate.mentorIntroTitle}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, mentorIntroTitle: v }))}
                  original={originalEmailTemplate.mentorIntroTitle}
                  placeholder="担当メンターのご紹介"
                />
                <TemplateField
                  label="メンター紹介ラベル"
                  value={emailTemplate.mentorIntroPrefix}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, mentorIntroPrefix: v }))}
                  original={originalEmailTemplate.mentorIntroPrefix}
                  placeholder="担当メンター:"
                />
                <TemplateField
                  label="LINEボタンテキスト"
                  value={emailTemplate.lineButtonText}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, lineButtonText: v }))}
                  original={originalEmailTemplate.lineButtonText}
                  placeholder="LINEで友達追加する"
                />
                <TemplateField
                  label="予約ボタンテキスト"
                  value={emailTemplate.bookingButtonText}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, bookingButtonText: v }))}
                  original={originalEmailTemplate.bookingButtonText}
                  placeholder="初回面談を予約する"
                />
                <TemplateField
                  label="連絡先案内"
                  value={emailTemplate.fallbackContact}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, fallbackContact: v }))}
                  original={originalEmailTemplate.fallbackContact}
                  placeholder="ご質問は support@akagiconsulting.com まで"
                />
                <TemplateField
                  label="リンク有効期限"
                  value={emailTemplate.linkExpiry}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, linkExpiry: v }))}
                  original={originalEmailTemplate.linkExpiry}
                  placeholder="このリンクの有効期限は発行から30日間です。"
                />
                <TemplateField
                  label="リンク案内"
                  value={emailTemplate.linkFallback}
                  onChange={(v) => setEmailTemplate((p) => ({ ...p, linkFallback: v }))}
                  original={originalEmailTemplate.linkFallback}
                  placeholder="もしリンクが機能しない場合は..."
                />
              </div>
            </div>

            {/* Email Preview */}
            <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">プレビュー</h2>
                <p className="text-xs text-gray-500 mt-1">実際のメール表示イメージ</p>
              </div>
              <div className="p-6">
                <div className="bg-white rounded-lg p-6 max-w-[600px] mx-auto text-[#333] text-sm">
                  <div className="text-center mb-6">
                    <h1 className="text-xl font-bold text-[#C13028] m-0">
                      Strategists {previewReplace(emailTemplate.subject).replace(/【Strategists\s*/, "").replace(/】.*/, "")}
                    </h1>
                  </div>
                  <p className="leading-relaxed">{previewReplace(emailTemplate.greeting)}</p>
                  <p className="leading-relaxed whitespace-pre-line">{previewReplace(emailTemplate.body)}</p>
                  <div className="text-center my-6">
                    <span className="inline-block px-6 py-3 bg-[#C13028] text-white rounded-lg font-bold text-sm">
                      {emailTemplate.ctaText}
                    </span>
                  </div>
                  <div className="bg-[#f8f8f8] border-l-4 border-[#C13028] p-4 rounded-r-lg my-4">
                    <p className="font-bold text-sm m-0 mb-1">{emailTemplate.mentorIntroTitle}</p>
                    <p className="text-sm m-0">{emailTemplate.mentorIntroPrefix} <strong>山田太郎</strong></p>
                    <p className="mt-2 m-0">
                      <span className="inline-block px-3 py-1.5 bg-[#06C755] text-white rounded-md text-xs">
                        {emailTemplate.lineButtonText}
                      </span>
                    </p>
                    <p className="mt-2 m-0">
                      <span className="inline-block px-3 py-1.5 bg-[#C13028] text-white rounded-md text-xs">
                        {emailTemplate.bookingButtonText}
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-[#888] leading-relaxed">
                    {emailTemplate.linkExpiry}<br />
                    {emailTemplate.linkFallback}
                  </p>
                  <p className="text-xs text-[#888]">https://strategists-lms.vercel.app/auth/setup?token=...</p>
                  <hr className="border-t border-[#eee] my-6" />
                  <p className="text-xs text-[#aaa] text-center">&copy; Strategists by Akagi Consulting</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DM Template Tab */}
        {activeTab === "dm" && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={handleSaveDmTemplate}
                disabled={!hasDmChanges || savingDm}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
                  hasDmChanges && !savingDm
                    ? "bg-brand text-white hover:bg-brand-dark"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                {savingDm ? "保存中..." : "保存"}
              </button>
            </div>

            <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">メンターDMテンプレート</h2>
                <p className="text-xs text-gray-500 mt-1">
                  メンターへの指導依頼DM文面を編集します。{`{{studentName}}`} が変数として使用できます。
                </p>
              </div>
              <div className="divide-y divide-white/5">
                <TemplateField
                  label="ヘッダー"
                  value={dmTemplate.header}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, header: v }))}
                  original={originalDmTemplate.header}
                  placeholder="新規受講生の指導依頼"
                />
                <TemplateField
                  label="タイトル形式"
                  value={dmTemplate.titleFormat}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, titleFormat: v }))}
                  original={originalDmTemplate.titleFormat}
                  placeholder="【指導依頼】{{studentName}} 様"
                  hint="{{studentName}} = 受講生の名前"
                />
                <TemplateField
                  label="プランラベル"
                  value={dmTemplate.planLabel}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, planLabel: v }))}
                  original={originalDmTemplate.planLabel}
                  placeholder="プラン:"
                />
                <TemplateField
                  label="契約期間ラベル"
                  value={dmTemplate.contractLabel}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, contractLabel: v }))}
                  original={originalDmTemplate.contractLabel}
                  placeholder="契約期間:"
                />
                <TemplateField
                  label="総指導回数ラベル"
                  value={dmTemplate.sessionsLabel}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, sessionsLabel: v }))}
                  original={originalDmTemplate.sessionsLabel}
                  placeholder="総指導回数:"
                />
                <TemplateField
                  label="指導開始日ラベル"
                  value={dmTemplate.startDateLabel}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, startDateLabel: v }))}
                  original={originalDmTemplate.startDateLabel}
                  placeholder="指導開始日:"
                />
                <TemplateField
                  label="指導終了日ラベル"
                  value={dmTemplate.endDateLabel}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, endDateLabel: v }))}
                  original={originalDmTemplate.endDateLabel}
                  placeholder="指導終了日:"
                />
                <TemplateField
                  label="メールラベル"
                  value={dmTemplate.emailLabel}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, emailLabel: v }))}
                  original={originalDmTemplate.emailLabel}
                  placeholder="メール:"
                />
                <TemplateField
                  label="シートリンクテキスト"
                  value={dmTemplate.sheetLinkText}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, sheetLinkText: v }))}
                  original={originalDmTemplate.sheetLinkText}
                  placeholder="プログレスシートを開く"
                />
                <TemplateField
                  label="結びの言葉"
                  value={dmTemplate.closing}
                  onChange={(v) => setDmTemplate((p) => ({ ...p, closing: v }))}
                  original={originalDmTemplate.closing}
                  placeholder="よろしくお願いいたします。"
                />
              </div>
            </div>

            {/* DM Preview */}
            <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">プレビュー</h2>
                <p className="text-xs text-gray-500 mt-1">Slack DMの表示イメージ</p>
              </div>
              <div className="p-6">
                <div className="bg-white rounded-lg p-4 max-w-[500px] mx-auto text-[#1d1c1d] text-sm">
                  <div className="font-bold text-base mb-2">{dmTemplate.header}</div>
                  <div className="border-l-4 border-[#e8912d] pl-3 py-1">
                    <p className="font-bold mb-2">{previewReplaceDm(dmTemplate.titleFormat)}</p>
                    <p className="text-[#616061]">{dmTemplate.planLabel} 既卒スタンダード</p>
                    <p className="text-[#616061]">{dmTemplate.contractLabel} 6ヶ月</p>
                    <p className="text-[#616061]">{dmTemplate.sessionsLabel} 12回</p>
                    <p className="text-[#616061]">{dmTemplate.startDateLabel} 2026-03-10</p>
                    <p className="text-[#616061]">{dmTemplate.endDateLabel} 2026-09-10</p>
                    <p className="text-[#616061]">{dmTemplate.emailLabel} sample@example.com</p>
                    <p className="mt-2">
                      <span className="text-[#1264a3] underline">{dmTemplate.sheetLinkText}</span>
                    </p>
                    <p className="mt-2 text-[#616061]">{dmTemplate.closing}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function previewReplace(text: string): string {
  return text
    .replace(/\{\{appName\}\}/g, "LMS")
    .replace(/\{\{displayName\}\}/g, "田中花子")
    .replace(/\{\{roleLabel\}\}/g, "受講生");
}

function previewReplaceDm(text: string): string {
  return text.replace(/\{\{studentName\}\}/g, "田中花子");
}

function TemplateField({
  label,
  value,
  onChange,
  original,
  multiline,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  original: string;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  const changed = value !== original;

  return (
    <div className="px-6 py-4">
      <label className="block text-sm font-medium text-gray-200 mb-1">
        {label}
        {changed && <span className="ml-2 text-xs text-amber-400">(変更あり)</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-1.5">{hint}</p>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`w-full px-3 py-2 text-sm rounded-lg border bg-surface-elevated text-white focus:outline-none focus:ring-2 focus:ring-brand/50 resize-y ${
            changed ? "border-amber-500/50" : "border-white/10"
          }`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 text-sm rounded-lg border bg-surface-elevated text-white focus:outline-none focus:ring-2 focus:ring-brand/50 ${
            changed ? "border-amber-500/50" : "border-white/10"
          }`}
        />
      )}
    </div>
  );
}
