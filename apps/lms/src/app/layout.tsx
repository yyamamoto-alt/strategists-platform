import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { getLmsSession } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Strategists LMS | 学習管理",
  description: "戦略コンサル転職塾 - 学習管理システム",
  icons: { icon: "/favicon.png" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  let initialUser: { email: string; id: string } | null = null;
  let initialRole: "admin" | "mentor" | "student" | null = null;

  if (!useMock) {
    try {
      const session = await getLmsSession();
      if (session) {
        initialUser = session.user;
        initialRole = session.role;
      }
    } catch {
      // Supabase 未設定の場合はスキップ
    }
  }

  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AuthProvider initialUser={initialUser} initialRole={initialRole}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
