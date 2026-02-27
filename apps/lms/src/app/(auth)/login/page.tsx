"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  useEffect(() => {
    if (useMock) {
      router.push("/courses");
    }
  }, [useMock, router]);

  if (useMock) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">ログイン</h1>
          <p className="text-gray-400">アカウントにログインしてください</p>
        </div>
        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">メールアドレス</label>
            <input type="email" placeholder="you@example.com" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">パスワード</label>
            <input type="password" placeholder="パスワード" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">ログイン</button>
        </form>
        <div className="mt-6 text-center space-y-3">
          <p className="text-gray-400 text-sm">アカウントをお持ちでない方 <Link href="/register" className="text-blue-400 hover:text-blue-300 font-medium">新規登録</Link></p>
          <p className="text-gray-400 text-sm">入塾をご希望の方 <Link href="/apply" className="text-blue-400 hover:text-blue-300 font-medium">申請はこちら</Link></p>
        </div>
      </div>
    </div>
  );
}
