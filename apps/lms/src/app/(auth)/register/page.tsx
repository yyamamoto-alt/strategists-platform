"use client";

import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">新規登録</h1>
          <p className="text-gray-400">学習を始めましょう</p>
        </div>
        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">お名前</label>
            <input type="text" placeholder="山田 太郎" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">メールアドレス</label>
            <input type="email" placeholder="you@example.com" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">パスワード</label>
            <input type="password" placeholder="8文字以上" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">登録</button>
        </form>
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">既にアカウントをお持ちの方 <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">ログイン</Link></p>
        </div>
      </div>
    </div>
  );
}
