"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { UserRole } from "@strategy-school/shared-db";

interface AuthContextType {
  user: { email: string; id: string } | null;
  role: UserRole | null;
  displayName: string | null;
  avatarUrl: string | null;
  setAvatarUrl: (url: string) => void;
  loading: boolean;
  subsidyEligible: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  displayName: null,
  avatarUrl: null,
  setAvatarUrl: () => {},
  loading: false,
  subsidyEligible: false,
  signOut: async () => {},
});

export function AuthProvider({
  children,
  initialUser,
  initialRole,
  initialDisplayName,
  initialAvatarUrl,
  initialCustomerId,
}: {
  children: ReactNode;
  initialUser?: { email: string; id: string } | null;
  initialRole?: UserRole | null;
  initialDisplayName?: string | null;
  initialAvatarUrl?: string | null;
  initialCustomerId?: string | null;
}) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  const [user] = useState(
    useMock
      ? { email: "student@example.com", id: "mock-student" }
      : initialUser ?? null
  );
  const [role] = useState<UserRole | null>(
    useMock ? "admin" : initialRole ?? null
  );
  const [displayName] = useState<string | null>(
    useMock ? "テスト受講生" : initialDisplayName ?? null
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    useMock ? null : initialAvatarUrl ?? null
  );
  // 管理者/メンターは常に補助金メニューを表示（受講生プレビュー用）
  const isAdminOrMentor = role === "admin" || role === "mentor";
  const [subsidyEligible, setSubsidyEligible] = useState(isAdminOrMentor);
  const [loading] = useState(false);

  // 受講生の場合のみ補助金対象チェックをクライアントサイドで遅延実行
  useEffect(() => {
    if (useMock || isAdminOrMentor || !initialCustomerId) return;
    fetch("/api/student/plan")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.subsidy_eligible) setSubsidyEligible(true);
      })
      .catch(() => {});
  }, [useMock, isAdminOrMentor, initialCustomerId]);

  const signOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, role, displayName, avatarUrl, setAvatarUrl, loading, subsidyEligible, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
