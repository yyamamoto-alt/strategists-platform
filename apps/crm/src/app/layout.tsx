import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { getSession } from "@/lib/supabase/auth-server";

export const metadata: Metadata = {
  title: "Strategists CRM | 経営管理",
  description: "戦略コンサル転職塾 - 顧客管理・営業パイプライン・売上管理",
  icons: { icon: "/favicon.png" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  let initialUser = null;
  let initialRole = null;

  if (!useMock) {
    try {
      const session = await getSession();
      if (session) {
        initialUser = session.user;
        initialRole = session.role;
      }
    } catch {
      // 認証エラー時はnullのまま（middleware がリダイレクトする）
    }
  }

  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <AuthProvider initialUser={initialUser} initialRole={initialRole}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
