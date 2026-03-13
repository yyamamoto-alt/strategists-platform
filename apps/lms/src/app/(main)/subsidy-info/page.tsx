export const dynamic = "force-dynamic";

export default function SubsidyInfoPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold text-white mb-2">補助金適用の方へ</h1>
      <p className="text-gray-400 text-sm mb-8">
        リスキリングを通じたキャリアアップ支援事業による補助金プランをご利用の方向けの重要なご案内です。
      </p>

      {/* 修了条件 */}
      <div className="bg-surface-card border border-amber-500/30 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-bold text-amber-400 mb-4">修了条件（必須）</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-4">
          50%の半額割引については、当社プログラムを<span className="text-white font-bold">「修了」</span>されることが条件となっております。
          以下の<span className="text-white font-bold">3要件</span>を必ず満たしていただくようお願いいたします。
        </p>

        <div className="space-y-4">
          {/* 条件1 */}
          <div className="flex gap-4 items-start bg-white/[0.03] rounded-lg p-4">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold shrink-0">1</div>
            <div>
              <p className="text-white font-medium">ケースメンタリングを4回以上受講</p>
              <p className="text-gray-400 text-sm mt-1">マンツーマン指導を合計4時間以上受けてください。</p>
            </div>
          </div>

          {/* 条件2 */}
          <div className="flex gap-4 items-start bg-white/[0.03] rounded-lg p-4">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold shrink-0">2</div>
            <div>
              <p className="text-white font-medium">ビヘイビア指導を1回以上受講</p>
              <p className="text-gray-400 text-sm mt-1">ビヘイビア面接の指導を最低1回受けてください。</p>
            </div>
          </div>

          {/* 条件3 */}
          <div className="flex gap-4 items-start bg-white/[0.03] rounded-lg p-4">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold shrink-0">3</div>
            <div>
              <p className="text-white font-medium">教材を閲覧し、フォームで報告</p>
              <p className="text-gray-400 text-sm mt-1">
                教科書・動画講座を閲覧した後、以下のフォームから完了報告を提出してください。
              </p>
              <a
                href="https://forms.gle/tkut12PeXYNh8WdN8"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand/80 transition-colors"
              >
                教材アウトプットフォームを開く
              </a>
            </div>
          </div>
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
