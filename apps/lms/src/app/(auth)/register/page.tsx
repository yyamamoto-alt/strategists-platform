"use client";

import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-surface-card border border-white/10 rounded-2xl shadow-[0_8px_25px_rgba(0,0,0,0.5)] p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">新規登録</h1>
          <p className="text-gray-400">学習を始めましょう</p>
        </div>
        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">お名前</label>
            <input type="text" placeholder="山田 太郎" className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">メールアドレス</label>
            <input type="email" placeholder="you@example.com" className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">パスワード</label>
            <input type="password" placeholder="8文字以上" className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <button type="submit" className="w-full py-2.5 px-4 bg-brand hover:bg-brand-dark text-white font-medium rounded-lg transition-colors">登録</button>
        </form>
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">既にアカウントをお持ちの方 <Link href="/login" className="text-brand-light hover:text-brand-light font-medium">ログイン</Link></p>
        </div>
      </div>
    </div>
  );
}
