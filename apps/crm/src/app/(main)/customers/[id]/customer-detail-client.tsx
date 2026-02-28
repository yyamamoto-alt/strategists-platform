"use client";

import Link from "next/link";
import {
  formatDate,
  formatCurrency,
  formatPercent,
  getStageColor,
  getAttributeColor,
  getDealStatusColor,
} from "@/lib/utils";
import {
  calcSalesProjection,
  calcExpectedLTV,
  calcClosingProbability,
  calcExpectedReferralFee,
  calcAgentProjectedRevenue,
  calcRemainingSessions,
  calcSessionProgress,
  calcScheduleProgress,
  calcProgressStatus,
  isAgentCustomer,
  isAgentConfirmed,
  getSubsidyAmount,
} from "@/lib/calc-fields";
import type { CustomerWithRelations, Activity } from "@strategy-school/shared-db";

interface CustomerDetailClientProps {
  customer: CustomerWithRelations;
  activities: Activity[];
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-white mt-0.5">{value}</p>
    </div>
  );
}

export function CustomerDetailClient({
  customer,
  activities,
}: CustomerDetailClientProps) {
  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link
          href="/customers"
          className="text-gray-400 hover:text-gray-300 transition-colors"
        >
          ← 戻る
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-brand-muted text-brand rounded-full flex items-center justify-center font-bold text-lg">
              {customer.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{customer.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(customer.attribute)}`}>
                  {customer.attribute}
                </span>
                {customer.pipeline && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(customer.pipeline.stage)}`}>
                    {customer.pipeline.stage}
                  </span>
                )}
                {customer.pipeline && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(customer.pipeline.deal_status)}`}>
                    {customer.pipeline.deal_status}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <button className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark">
          編集
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 基本情報 */}
          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">基本情報</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <InfoRow label="申込日" value={formatDate(customer.application_date)} />
              <InfoRow label="メール" value={customer.email || "-"} />
              <InfoRow label="電話番号" value={customer.phone || "-"} />
              <InfoRow label="流入元" value={`${customer.utm_source || "-"} / ${customer.utm_medium || "-"}`} />
              <InfoRow label="大学" value={customer.university || "-"} />
              <InfoRow label="学部" value={customer.faculty || "-"} />
              <InfoRow label="優先度" value={customer.priority || "-"} />
              <InfoRow label="初期レベル" value={customer.initial_level || "-"} />
            </div>
            {customer.career_history && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 font-medium mb-1">経歴</p>
                <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                  {customer.career_history}
                </p>
              </div>
            )}
            {customer.target_companies && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 font-medium mb-1">志望企業</p>
                <p className="text-sm text-gray-300 bg-surface-elevated p-3 rounded-lg">
                  {customer.target_companies}
                </p>
              </div>
            )}
          </div>

          {/* 営業・商談情報 */}
          {customer.pipeline && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">営業・商談情報</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="面談予定日" value={formatDate(customer.pipeline.meeting_scheduled_date)} />
                <InfoRow label="面談実施日" value={formatDate(customer.pipeline.meeting_conducted_date)} />
                <InfoRow label="営業日" value={formatDate(customer.pipeline.sales_date)} />
                <InfoRow label="成約日" value={formatDate(customer.pipeline.closing_date)} />
                <InfoRow label="入金日" value={formatDate(customer.pipeline.payment_date)} />
                <InfoRow label="エージェント希望" value={customer.pipeline.agent_interest_at_application ? "あり" : "なし"} />
                <InfoRow label="決め手" value={customer.pipeline.decision_factor || "-"} />
                <InfoRow label="比較サービス" value={customer.pipeline.comparison_services || "-"} />
              </div>
              {customer.pipeline.sales_content && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">営業内容</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                    {customer.pipeline.sales_content}
                  </p>
                </div>
              )}
              {customer.pipeline.sales_strategy && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">営業方針</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                    {customer.pipeline.sales_strategy}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 売上見込サマリー */}
          {(customer.contract || customer.pipeline) && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">売上見込</h2>
              <div className="space-y-3">
                {/* 売上見込の分解 */}
                <div className="bg-surface-elevated rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">確定売上（スクール）</span>
                    <span className="text-white font-medium">{customer.contract?.confirmed_amount ? formatCurrency(customer.contract.confirmed_amount) : "¥0"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">補助金額（リスキャリ）</span>
                    <span className="text-white font-medium">{(() => { const s = getSubsidyAmount(customer); return s > 0 ? formatCurrency(s) : "¥0"; })()}{customer.contract?.subsidy_eligible ? " （対象）" : ""}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">人材見込売上</span>
                    <span className="text-white font-medium">{(() => { const v = calcAgentProjectedRevenue(customer); return v > 0 ? formatCurrency(v) : "¥0"; })()}</span>
                  </div>
                  <div className="border-t border-white/10 pt-2 flex justify-between text-sm">
                    <span className="text-white font-semibold">売上見込 合計</span>
                    <span className="text-brand font-bold text-base">{(() => { const v = calcSalesProjection(customer); return v > 0 ? formatCurrency(v) : "-"; })()}</span>
                  </div>
                </div>
                {/* 見込LTV・成約見込率 */}
                <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                  <InfoRow label="成約見込率" value={formatPercent(calcClosingProbability(customer))} />
                  <InfoRow label="見込LTV" value={(() => { const v = calcExpectedLTV(customer); return v > 0 ? formatCurrency(v) : "-"; })()} />
                </div>
              </div>
            </div>
          )}

          {/* 契約情報 */}
          {customer.contract && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">契約・入金情報</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="プラン" value={customer.contract.plan_name || "-"} />
                <InfoRow label="変更プラン" value={customer.contract.changed_plan || "-"} />
                <InfoRow label="一次金額" value={customer.contract.first_amount ? formatCurrency(customer.contract.first_amount) : "-"} />
                <InfoRow label="確定売上" value={customer.contract.confirmed_amount ? formatCurrency(customer.contract.confirmed_amount) : "-"} />
                <InfoRow label="割引" value={customer.contract.discount ? formatCurrency(customer.contract.discount) : "なし"} />
                <InfoRow label="請求状況" value={customer.contract.billing_status} />
                <InfoRow label="入金日" value={formatDate(customer.contract.payment_date)} />
                <InfoRow label="補助金対象" value={customer.contract.subsidy_eligible ? "対象" : "非対象"} />
                <InfoRow label="補助金額" value={(() => { const s = getSubsidyAmount(customer); return s > 0 ? formatCurrency(s) : "-"; })()} />
              </div>
            </div>
          )}

          {/* 学習情報 */}
          {customer.learning && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">学習状況</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="指導メンター" value={customer.learning.mentor_name || "-"} />
                <InfoRow label="契約月数" value={customer.learning.contract_months != null ? `${customer.learning.contract_months}ヶ月` : "-"} />
                <InfoRow label="指導開始日" value={formatDate(customer.learning.coaching_start_date)} />
                <InfoRow label="指導終了日" value={formatDate(customer.learning.coaching_end_date)} />
                <InfoRow label="最終指導日" value={formatDate(customer.learning.last_coaching_date)} />
                <InfoRow label="契約指導回数" value={customer.learning.total_sessions.toString()} />
                <InfoRow label="指導完了数" value={customer.learning.completed_sessions != null ? customer.learning.completed_sessions.toString() : "-"} />
                <InfoRow label="残指導回数" value={`${calcRemainingSessions(customer)}回`} />
                <InfoRow label="日程消化率" value={(() => { const v = calcScheduleProgress(customer); return v !== null ? formatPercent(v) : "-"; })()} />
                <InfoRow label="指導消化率" value={(() => { const v = calcSessionProgress(customer); return v !== null ? formatPercent(v) : "-"; })()} />
                <InfoRow label="進捗ステータス" value={calcProgressStatus(customer)} />
                <InfoRow label="現在のレベル" value={customer.learning.current_level || "-"} />
                <InfoRow label="フェルミ" value={customer.learning.level_fermi || "-"} />
                <InfoRow label="ケース" value={customer.learning.level_case || "-"} />
                <InfoRow label="McK" value={customer.learning.level_mck || "-"} />
                <InfoRow label="カリキュラム進捗" value={customer.learning.curriculum_progress !== null ? formatPercent(customer.learning.curriculum_progress) : "-"} />
                <InfoRow label="最新評価" value={customer.learning.latest_evaluation || "-"} />
              </div>
              {customer.learning.case_interview_progress && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">ケース面接対策状況</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                    {customer.learning.case_interview_progress}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* エージェント情報 */}
          {customer.agent && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">エージェント・転職支援</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="エージェント利用" value={isAgentCustomer(customer) ? "利用中" : "なし"} />
                <InfoRow label="プラン" value={customer.agent.agent_plan || "-"} />
                <InfoRow label="転職活動状況" value={customer.agent.job_search_status} />
                <InfoRow label="選考状況" value={customer.agent.selection_status || "-"} />
                <InfoRow label="内定先" value={customer.agent.offer_company || "-"} />
                <InfoRow label="想定年収" value={customer.agent.offer_salary ? formatCurrency(customer.agent.offer_salary) : "-"} />
                <InfoRow label="入社至る率" value={customer.agent.hire_rate != null ? formatPercent(customer.agent.hire_rate) : "-"} />
                <InfoRow label="内定確度" value={customer.agent.offer_probability != null ? formatPercent(customer.agent.offer_probability) : "-"} />
                <InfoRow label="紹介料率" value={customer.agent.referral_fee_rate ? formatPercent(customer.agent.referral_fee_rate) : "-"} />
                <InfoRow label="マージン" value={customer.agent.margin != null ? `${customer.agent.margin}` : "-"} />
                <InfoRow label="人材紹介報酬期待値" value={(() => { const v = calcExpectedReferralFee(customer); return v > 0 ? formatCurrency(v) : "-"; })()} />
                <InfoRow label="人材見込売上" value={(() => { const v = calcAgentProjectedRevenue(customer); return v > 0 ? formatCurrency(v) : "-"; })()} />
                <InfoRow label="人材確定" value={isAgentConfirmed(customer) ? "確定" : "未確定"} />
                <InfoRow label="入社予定日" value={formatDate(customer.agent.placement_date ?? null)} />
                <InfoRow label="外部エージェント" value={customer.agent.external_agents || "-"} />
                <InfoRow label="レベルアップ確認" value={customer.agent.level_up_confirmed || "-"} />
              </div>
              {customer.agent.agent_memo && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">エージェント業務メモ</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                    {customer.agent.agent_memo}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右カラム */}
        <div className="space-y-6">
          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">プロフィール</h2>
            <div className="space-y-3 text-sm">
              {customer.sns_accounts && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">SNS</p>
                  <p className="text-gray-300">{customer.sns_accounts}</p>
                </div>
              )}
              {customer.reference_media && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">参考メディア</p>
                  <p className="text-gray-300">{customer.reference_media}</p>
                </div>
              )}
              {customer.hobbies && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">趣味・特技</p>
                  <p className="text-gray-300">{customer.hobbies}</p>
                </div>
              )}
              {customer.behavioral_traits && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">行動特性</p>
                  <p className="text-gray-300">{customer.behavioral_traits}</p>
                </div>
              )}
              {customer.notes && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">備考</p>
                  <p className="text-gray-300 bg-yellow-900/20 p-2 rounded">{customer.notes}</p>
                </div>
              )}
              {customer.caution_notes && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">注意事項</p>
                  <p className="text-gray-300 bg-red-900/20 p-2 rounded">{customer.caution_notes}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">活動履歴</h2>
              <button className="text-xs text-brand hover:underline">
                + 追加
              </button>
            </div>
            <div className="space-y-4">
              {activities.length === 0 && (
                <p className="text-sm text-gray-400">活動履歴がありません</p>
              )}
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="border-l-2 border-brand/30 pl-3 py-1"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium bg-surface-elevated text-gray-300 px-2 py-0.5 rounded">
                      {activity.activity_type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(activity.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{activity.content}</p>
                  {activity.created_by && (
                    <p className="text-xs text-gray-400 mt-1">
                      担当: {activity.created_by}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
