"use client";

import { createContext, useContext, useState, ReactNode } from "react";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  const [user] = useState(
    useMock ? { email: "student@example.com", id: "mock-student" } : null
  );
  const [role] = useState<UserRole | null>(useMock ? "admin" : null);
  const [loading] = useState(false);

  const signOut = async () => {};

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
