"use client";

import { createContext, useContext, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@strategy-school/shared-db";

interface AuthContextType {
  user: { email: string; id: string } | null;
  role: UserRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: false,
  signOut: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: { email: string; id: string } | null;
  initialRole?: UserRole | null;
}

export function AuthProvider({
  children,
  initialUser,
  initialRole,
}: AuthProviderProps) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
  const router = useRouter();

  const user = useMock
    ? { email: "admin@example.com", id: "mock-admin" }
    : initialUser ?? null;

  const role = useMock ? "admin" : initialRole ?? null;

  const signOut = async () => {
    if (useMock) return;

    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, role, loading: false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
