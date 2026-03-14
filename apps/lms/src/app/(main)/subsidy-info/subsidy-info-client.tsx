"use client";

import { CheckCircle, Circle, ExternalLink } from "lucide-react";
import type { SubsidyProgress } from "./page";

function ConditionCard({
  number,
  title,
  description,
  met,
  progressText,
  children,
}: {
  number: number;
  title: string;
  description: string;
  met: boolean;
  progressText: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex gap-4 items-start rounded-lg p-4 transition-colors ${
      met ? "bg-green-900/20 border border-green-500/30" : "bg-white/[0.03] border border-white/10"
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        met ? "bg-green-500/20" : "bg-amber-500/20"
      }`}>
        {met ? (
          <CheckCircle className="w-5 h-5 text-green-400" />
        ) : (
          <span className="text-amber-400 text-sm font-bold">{number}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <p className={`font-medium ${met ? "text-green-300" : "text-white"}`}>{title}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            met
              ? "bg-green-500/20 text-green-300 border border-green-500/30"
              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
          }`}>
            {progressText}
          </span>
        </div>
        <p className="text-gray-400 text-sm mt-1">{description}</p>
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = Math.min(100, Math.round((current / total) * 100));
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">進捗</span>
        <span className="text-white font-medium">{current} / {total}</span>
      </div>
      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            percent >= 100 ? "bg-green-500" : "bg-amber-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function SubsidyInfoClient({ progress }: { progress: SubsidyProgress | null }) {
  const allMet = progress
    ? progress.caseMet && progress.behaviorMet && progress.hasOutputForm
    : false;
  const metCount = progress
    ? [progress.caseMet, progress.behaviorMet, progress.hasOutputForm].filter(Boolean).length
    : 0;

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold text-white mb-2">補助金適用の方へ</h1>
      <p className="text-gray-400 text-sm mb-8">
        リスキリングを通じたキャリアアップ支援事業による補助金プランをご利用の方向けの重要なご案内です。
      </p>

      {/* 達成状況サマリー */}
      <div className={`rounded-xl p-5 mb-6 border ${
        allMet
          ? "bg-green-900/20 border-green-500/30"
          : "bg-surface-card border-white/10"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-lg font-bold ${allMet ? "text-green-300" : "text-white"}`}>
              {allMet ? "全条件達成済み" : "修了条件の達成状況"}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {allMet
                ? "おめでとうございます！全ての修了条件を満たしています。"
                : `3要件中 ${metCount}件 達成済み`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {[progress?.caseMet, progress?.behaviorMet, progress?.hasOutputForm].map((met, i) => (
              <div key={i} className={`w-3 h-3 rounded-full ${
                met ? "bg-green-500" : "bg-white/10"
              }`} />
            ))}
          </div>
        </div>
        {!allMet && progress && (
          <div className="mt-3 h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((metCount / 3) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* 修了条件チェックリスト */}
      <div className="bg-surface-card border border-amber-500/30 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-bold text-amber-400 mb-4">修了条件（必須）</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-4">
          50%の半額割引については、当社プログラムを<span className="text-white font-bold">「修了」</span>されることが条件となっております。
          以下の<span className="text-white font-bold">3要件</span>を必ず満たしていただくようお願いいたします。
        </p>

        <div className="space-y-4">
          {/* 条件1: マンツーマン指導4回 */}
          <ConditionCard
            number={1}
            title="ケースメンタリングを4回以上受講"
            description="マンツーマン指導を合計4回以上受けてください。"
            met={progress?.caseMet ?? false}
            progressText={progress ? `${progress.caseSessionCount} / ${progress.caseRequired}回` : "-- / 4回"}
          >
            {progress && <ProgressBar current={progress.caseSessionCount} total={progress.caseRequired} />}
          </ConditionCard>

          {/* 条件2: ビヘイビア指導1回 */}
          <ConditionCard
            number={2}
            title="ビヘイビア指導を1回以上受講"
            description="ビヘイビア面接の指導を最低1回受けてください。"
            met={progress?.behaviorMet ?? false}
            progressText={progress ? `${progress.behaviorSessionCount} / ${progress.behaviorRequired}回` : "-- / 1回"}
          >
            {progress && <ProgressBar current={progress.behaviorSessionCount} total={progress.behaviorRequired} />}
          </ConditionCard>

          {/* 条件3: 教材アウトプットフォーム */}
          <ConditionCard
            number={3}
            title="教材を閲覧し、フォームで報告"
            description="教科書・動画講座を閲覧した後、以下のフォームから完了報告を提出してください。"
            met={progress?.hasOutputForm ?? false}
            progressText={progress?.hasOutputForm ? "提出済み" : "未提出"}
          >
            {progress?.hasOutputForm && progress.outputFormDate && (
              <p className="text-xs text-green-400/70 mt-2">
                提出日: {new Date(progress.outputFormDate).toLocaleDateString("ja-JP")}
              </p>
            )}
            {!progress?.hasOutputForm && (
              <a
                href="https://forms.gle/tkut12PeXYNh8WdN8"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand/80 transition-colors"
              >
                教材アウトプットフォームを開く
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </ConditionCard>
        </div>
      </div>

      {/* 注意事項 */}
      <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-bold text-red-400 mb-3">重要な注意事項</h2>
        <p className="text-gray-300 text-sm leading-relaxed">
          指導期間内（<span className="text-white font-bold">3ヶ月以内</span>）に上記3要件を満たさない場合、
          <span className="text-red-400 font-bold">補助額相当分をご請求させていただきます</span>。
        </p>
        <p className="text-gray-400 text-sm mt-3">
          期間内に計画的に受講を進めていただくようお願いいたします。
          ご不明な点がございましたら、担当メンターまたは support@akagiconsulting.com までお問い合わせください。
        </p>
      </div>

      {/* 補助金の概要 */}
      <div className="bg-surface-card border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">補助金の概要</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-white/5">
              <td className="py-3 text-gray-400">講座受講料</td>
              <td className="py-3 text-white text-right">407,273円（税抜）</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-3 text-gray-400">消費税</td>
              <td className="py-3 text-white text-right">40,727円</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-3 text-gray-400 font-medium">合計</td>
              <td className="py-3 text-white text-right font-medium">448,000円</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-3 text-amber-400">リスキリング補助金補填</td>
              <td className="py-3 text-amber-400 text-right">-203,636円</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-3 text-gray-400">当社負担による補填</td>
              <td className="py-3 text-white text-right">-20,364円</td>
            </tr>
            <tr>
              <td className="py-3 text-white font-bold">お客様ご負担額</td>
              <td className="py-3 text-white text-right font-bold text-lg">224,000円</td>
            </tr>
          </tbody>
        </table>
        <p className="text-gray-500 text-xs mt-4 leading-relaxed">
          ※ リスキリングを通じたキャリアアップ支援事業補填金は公的な国庫補助金を財源とした補填金であり、
          資産の譲渡等の対価として支払うものではないことから、消費税は不課税です。
        </p>
      </div>
    </div>
  );
}
