import "server-only";

import { getSession } from "@/lib/supabase/auth-server";
import { NextResponse } from "next/server";

type SessionResult = Awaited<ReturnType<typeof getSession>>;

/**
 * APIルートで認証済みセッションを取得。未認証なら401レスポンスを返す。
 */
export async function requireAuth(): Promise<
  | { session: NonNullable<SessionResult>; error?: never }
  | { session?: never; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  return { session };
}

/**
 * APIルートでadmin権限を要求。admin以外は403レスポンスを返す。
 */
export async function requireAdmin(): Promise<
  | { session: NonNullable<SessionResult>; error?: never }
  | { session?: never; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (session.role !== "admin") {
    return { error: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }) };
  }
  return { session };
}
