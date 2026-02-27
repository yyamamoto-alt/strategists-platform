"use client";

import { useState } from "react";
import Link from "next/link";

export default function ApplyPage() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-surface-card border border-white/10 rounded-2xl shadow-[0_8px_25px_rgba(0,0,0,0.5)] p-8 text-center">
          <div className="w-16 h-16 bg-green-900/30 border border-green-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">申請完了</h1>
          <p className="text-gray-400">入塾申請を受け付けました。審査結果をメールでお送りします。</p>
          <Link href="/login" className="inline-block mt-6 py-2.5 px-6 bg-brand hover:bg-brand-dark text-white font-medium rounded-lg transition-colors">ログインページへ</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg px-6 py-12">
      <div className="bg-surface-card border border-white/10 rounded-2xl shadow-[0_8px_25px_rgba(0,0,0,0.5)] p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">入塾申請</h1>
          <p className="text-gray-400">以下のフォームに記入して申請してください</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">お名前 <span className="text-red-400">*</span></label>
            <input type="text" required placeholder="山田 太郎" className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">メールアドレス <span className="text-red-400">*</span></label>
            <input type="email" required placeholder="you@example.com" className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">志望動機 <span className="text-red-400">*</span></label>
            <textarea required rows={4} placeholder="入塾を希望する理由を記入してください" className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
          </div>
          <button type="submit" className="w-full py-2.5 px-4 bg-brand hover:bg-brand-dark text-white font-medium rounded-lg transition-colors">申請する</button>
        </form>
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">既にアカウントをお持ちの方 <Link href="/login" className="text-brand-light hover:text-brand-light font-medium">ログイン</Link></p>
        </div>
      </div>
    </div>
  );
}
