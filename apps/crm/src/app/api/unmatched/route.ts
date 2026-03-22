import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connection_id");
  const status = searchParams.get("status") || "pending";

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  let query = db
    .from("unmatched_records")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (connectionId) {
    query = query.eq("connection_id", connectionId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}
