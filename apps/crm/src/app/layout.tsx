import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { getSession } from "@/lib/supabase/auth-server";
import { SWRProvider } from "@/components/swr-provider";
import { ProgressBarProvider } from "@/components/progress-bar-provider";

export const metadata: Metadata = {
  title: "Strategists CRM | 経営管理",
  description: "戦略コンサル転職塾 - 顧客管理・営業パイプライン・売上管理",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  let initialUser = null;
  let initialRole = null;
  let initialPermissions = null;

  if (!useMock) {
    try {
      const session = await getSession();
      if (session) {
        initialUser = session.user;
        initialRole = session.role;
        initialPermissions = session.permissions;
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
        <AuthProvider initialUser={initialUser} initialRole={initialRole} initialPermissions={initialPermissions}>
          <SWRProvider>
            <Suspense fallback={null}>
              <ProgressBarProvider />
            </Suspense>
            {children}
          </SWRProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
