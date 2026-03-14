"use client";

import { User, Briefcase, GraduationCap, BookOpen, UserCheck, ExternalLink, MessageCircle, Calendar, Clock, CheckCircle, Eye, Circle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

interface MentorInfo {
  name: string;
  booking_url: string | null;
  line_url: string | null;
  profile_text: string | null;
  role: string;
}

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
  mentors: MentorInfo[];
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

function MentorCard({ mentor }: { mentor: MentorInfo }) {
  const roleLabel = mentor.role === "primary" ? "主担当" : "副担当";
  return (
    <div className="bg-gradient-to-br from-surface-card to-surface-card/80 border border-white/10 rounded-xl overflow-hidden">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center">
            <span className="text-brand font-bold text-lg">{mentor.name.charAt(0)}</span>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{mentor.name}</p>
            <p className="text-xs text-gray-400">{roleLabel}</p>
          </div>
        </div>

        {mentor.profile_text && (
          <p className="text-sm text-gray-300 leading-relaxed bg-white/[0.03] rounded-lg p-3">
            {mentor.profile_text}
          </p>
        )}

        <div className="space-y-2.5">
          {mentor.booking_url && (
            <div>
              <a
                href={mentor.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-brand hover:bg-brand/90 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                <Calendar className="w-4 h-4" />
                面談を予約する
                <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
              </a>
              <p className="text-[11px] text-gray-500 mt-1.5 text-center">* ブックマークしておくと便利です</p>
            </div>
          )}
          {mentor.line_url && (
            <a
              href={mentor.line_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#06C755] hover:bg-[#06C755]/90 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              LINEで友達追加
              <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
            </a>
          )}
        </div>

        {!mentor.booking_url && !mentor.line_url && (
          <p className="text-xs text-gray-500 text-center py-2">メンターの連絡先情報は準備中です。</p>
        )}
      </div>
    </div>
  );
}

function MentorsSection({ mentors }: { mentors: MentorInfo[] }) {
  if (mentors.length === 0) return null;
  return (
    <div className="bg-gradient-to-br from-surface-card to-surface-card/80 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-brand" />
        <h2 className="text-sm font-semibold text-white">担当メンター</h2>
        {mentors.length > 1 && <span className="text-xs text-gray-500">{mentors.length}名</span>}
      </div>
      <div className="divide-y divide-white/5">
        {mentors.map((m, i) => <MentorCard key={i} mentor={m} />)}
      </div>
    </div>
  );
}

interface RecentLesson {
  id: string;
  title: string;
  courseSlug: string;
  courseTitle: string;
  status: string;
  updatedAt: string;
}

function statusIcon(s: string) {
  switch (s) {
    case "完了": return <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />;
    case "閲覧済み": return <Eye className="w-4 h-4 text-blue-400 shrink-0" />;
    case "進行中": return <Circle className="w-4 h-4 text-yellow-400 shrink-0" />;
    default: return <Circle className="w-4 h-4 text-gray-600 shrink-0" />;
  }
}

function RecentLessonsSection() {
  const [lessons, setLessons] = useState<RecentLesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/recent-lessons")
      .then(r => r.json())
      .then(d => setLessons(d.lessons || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-surface-card border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-white">最近のレッスン</h2>
        </div>
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (lessons.length === 0) return null;

  return (
    <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Clock className="w-4 h-4 text-brand" />
        <h2 className="text-sm font-semibold text-white">最近のレッスン</h2>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {lessons.map(lesson => (
          <Link
            key={lesson.id}
            href={`/courses/${lesson.courseSlug}/learn/${lesson.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
          >
            {statusIcon(lesson.status)}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{lesson.title}</p>
              <p className="text-xs text-gray-500">{lesson.courseTitle}</p>
            </div>
            <span className="text-[10px] text-gray-600 shrink-0">
              {new Date(lesson.updatedAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MyPageClient({ data }: { data: MyPageData | null }) {
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

  const { customer, contract, learning, mentors } = data;

  return (
    <div className="p-6 bg-surface min-h-screen space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">マイページ</h1>

      <RecentLessonsSection />

      <MentorsSection mentors={mentors || []} />

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
