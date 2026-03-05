"use client";

import { useState, useEffect } from "react";
import { User, Briefcase, GraduationCap, BookOpen } from "lucide-react";

interface MyPageData {
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    attribute: string | null;
    university: string | null;
    faculty: string | null;
    career_history: string | null;
    target_companies: string | null;
    target_firm_type: string | null;
    transfer_intent: string | null;
  } | null;
  contract: {
    plan_name: string;
    contract_date: string;
  } | null;
  learning: {
    coaching_start_date: string | null;
    total_sessions: number | null;
    remaining_sessions: number | null;
  } | null;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start py-2.5 border-b border-white/[0.06] last:border-0">
      <span className="text-xs text-gray-500 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-200">{value || "-"}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

export default function MyPage() {
  const [data, setData] = useState<MyPageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mypage")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>;

  if (!data?.customer) {
    return (
      <div className="p-6 bg-surface min-h-screen">
        <h1 className="text-2xl font-bold text-white mb-4">マイページ</h1>
        <div className="bg-surface-card border border-white/10 rounded-xl p-8 text-center text-gray-400">
          <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>顧客情報が見つかりません。</p>
          <p className="text-xs mt-2">ログインメールアドレスに紐づく情報がまだ登録されていない可能性があります。</p>
        </div>
      </div>
    );
  }

  const { customer, contract, learning } = data;

  return (
    <div className="p-6 bg-surface min-h-screen space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">マイページ</h1>

      <Section title="基本情報" icon={User}>
        <InfoRow label="名前" value={customer.name} />
        <InfoRow label="メールアドレス" value={customer.email} />
        <InfoRow label="電話番号" value={customer.phone} />
        <InfoRow label="属性" value={customer.attribute} />
        <InfoRow label="大学" value={customer.university} />
        <InfoRow label="学部" value={customer.faculty} />
      </Section>

      <Section title="志望・キャリア" icon={Briefcase}>
        <InfoRow label="志望企業" value={customer.target_companies} />
        <InfoRow label="対策ファーム意向" value={customer.target_firm_type} />
        <InfoRow label="経歴" value={customer.career_history} />
        <InfoRow label="転職意向" value={customer.transfer_intent} />
      </Section>

      {contract && (
        <Section title="契約情報" icon={GraduationCap}>
          <InfoRow label="プラン" value={contract.plan_name} />
          <InfoRow label="成約日" value={contract.contract_date ? new Date(contract.contract_date).toLocaleDateString("ja-JP") : null} />
        </Section>
      )}

      {learning && (
        <Section title="受講情報" icon={BookOpen}>
          <InfoRow label="指導開始日" value={learning.coaching_start_date ? new Date(learning.coaching_start_date).toLocaleDateString("ja-JP") : null} />
          <InfoRow label="総指導回数" value={learning.total_sessions != null ? `${learning.total_sessions}回` : null} />
          <InfoRow label="残り指導回数" value={learning.remaining_sessions != null ? `${learning.remaining_sessions}回` : null} />
        </Section>
      )}
    </div>
  );
}
