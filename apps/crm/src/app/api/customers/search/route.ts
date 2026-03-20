import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 1) {
    return NextResponse.json([]);
  }

  // Supabase PostgREST特殊文字をエスケープ
  const sanitized = q.replace(/[%_\\(),."]/g, (ch) => `\\${ch}`);

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 名前 or メール or カナで検索（上位10件）
  const { data, error } = await db
    .from("customers")
    .select("id, name, name_kana, email, attribute")
    .or(`name.ilike.%${sanitized}%,name_kana.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
    .limit(10);

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
