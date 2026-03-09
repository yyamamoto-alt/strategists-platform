"use client";

import { createContext, useContext, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@strategy-school/shared-db";

interface UserPermissions {
  allowed_pages: string[];
  data_months_limit: number | null;
  mask_pii: boolean;
}

interface AuthContextType {
  user: { email: string; id: string } | null;
  role: UserRole | null;
  permissions: UserPermissions;
  loading: boolean;
  signOut: () => Promise<void>;
  /** 個人情報マスキング: 名前をイニシャル化 */
  maskName: (name: string) => string;
  /** このページにアクセス可能か */
  canAccessPage: (path: string) => boolean;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
  allowed_pages: [],
  data_months_limit: null,
  mask_pii: false,
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  permissions: DEFAULT_PERMISSIONS,
  loading: false,
  signOut: async () => {},
  maskName: (name) => name,
  canAccessPage: () => true,
});

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: { email: string; id: string } | null;
  initialRole?: UserRole | null;
  initialPermissions?: UserPermissions | null;
}

function maskNameImpl(name: string): string {
  if (!name) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    // 姓の最初の1文字 + ◯ + スペース + ◯◯
    return parts[0].charAt(0) + "◯" + " " + "◯".repeat(Math.max(parts[1].length, 2));
  }
  // 1語の場合: 最初の1文字 + ◯ × (残り)
  return name.charAt(0) + "◯".repeat(Math.max(name.length - 1, 2));
}

export function AuthProvider({
  children,
  initialUser,
  initialRole,
  initialPermissions,
}: AuthProviderProps) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
  const router = useRouter();

  const user = useMock
    ? { email: "admin@example.com", id: "mock-admin" }
    : initialUser ?? null;

  const role = useMock ? "admin" : initialRole ?? null;
  const permissions = initialPermissions ?? DEFAULT_PERMISSIONS;

  const isAdmin = role === "admin";

  const maskName = (name: string): string => {
    if (isAdmin || !permissions.mask_pii) return name;
    return maskNameImpl(name);
  };

  const canAccessPage = (path: string): boolean => {
    if (isAdmin) return true;
    if (permissions.allowed_pages.length === 0) return true; // empty = all
    return permissions.allowed_pages.some((p) => path === p || path.startsWith(p + "/"));
  };

  const signOut = async () => {
    if (useMock) return;
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, role, permissions, loading: false, signOut, maskName, canAccessPage }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
