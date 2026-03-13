"use client";

import { createContext, useContext, useState, ReactNode } from "react";
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
  initialSubsidyEligible,
}: {
  children: ReactNode;
  initialUser?: { email: string; id: string } | null;
  initialRole?: UserRole | null;
  initialDisplayName?: string | null;
  initialAvatarUrl?: string | null;
  initialSubsidyEligible?: boolean;
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
  const [subsidyEligible] = useState(initialSubsidyEligible ?? false);
  const [loading] = useState(false);

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
