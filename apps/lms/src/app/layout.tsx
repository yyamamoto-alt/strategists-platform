import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { SWRProvider } from "@/components/swr-provider";

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
  let initialDisplayName: string | null = null;
  let initialAvatarUrl: string | null = null;
  let initialSubsidyEligible = false;

  if (!useMock) {
    try {
      const session = await getLmsSession();
      if (session) {
        initialUser = session.user;
        initialRole = session.role;
        initialDisplayName = session.displayName;
        initialAvatarUrl = session.avatarUrl;

        // 補助金対象かチェック
        if (session.customerId) {
          try {
            const supabase = await createLmsServerClient();
            const { data: contract } = await supabase
              .from("contracts")
              .select("subsidy_eligible")
              .eq("customer_id", session.customerId)
              .single() as { data: { subsidy_eligible: boolean } | null };
            if (contract?.subsidy_eligible) initialSubsidyEligible = true;
          } catch { /* ignore */ }
        }
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
        <AuthProvider initialUser={initialUser} initialRole={initialRole} initialDisplayName={initialDisplayName} initialAvatarUrl={initialAvatarUrl} initialSubsidyEligible={initialSubsidyEligible}>
          <SWRProvider>
            <Suspense fallback={null}>
              <NavigationProgress />
            </Suspense>
            {children}
          </SWRProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
