import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 許可するテーブル（SQLインジェクション防止）
const ALLOWED_TABLES = ["customers", "sales_pipeline", "contracts", "learning_records", "agent_records"];

// カラム名のバリデーション（英数字とアンダースコアのみ）
function isValidColumnName(name: string): boolean {
  return /^[a-z][a-z0-9_]{1,62}$/.test(name);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { table, column_name, column_label } = body;

  if (!table || !column_name) {
    return NextResponse.json({ error: "table と column_name は必須です" }, { status: 400 });
  }

  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: `テーブル '${table}' は許可されていません` }, { status: 400 });
  }

  if (!isValidColumnName(column_name)) {
    return NextResponse.json(
      { error: "カラム名は英小文字で始まり、英小文字・数字・アンダースコアのみ使用可能です（2-63文字）" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  try {
    // カラムが既に存在するかチェック
    const { data: existing } = await db.rpc("exec_sql", {
      sql: `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column_name}'`,
    });

    // rpcが使えない場合はraw SQLで試行
    // ALTER TABLE ... ADD COLUMN IF NOT EXISTS で安全に追加
    const alterSql = `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column_name} text`;

    // Supabase Management APIでSQL実行
    const projectRef = process.env.SUPABASE_URL?.match(/\/\/([^.]+)\./)?.[1];
    if (!projectRef) {
      return NextResponse.json({ error: "SUPABASE_URL からプロジェクトIDを取得できません" }, { status: 500 });
    }

    // service_role keyでRPC実行を試みる
    // 直接SQLは実行できないのでManagement APIを使う
    const mgmtToken = process.env.SUPABASE_ACCESS_TOKEN;
    if (mgmtToken) {
      const mgmtRes = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mgmtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: alterSql }),
        }
      );

      if (!mgmtRes.ok) {
        const errData = await mgmtRes.text();
        return NextResponse.json({ error: `カラム追加に失敗: ${errData}` }, { status: 500 });
      }
    } else {
      return NextResponse.json(
        { error: "SUPABASE_ACCESS_TOKEN が設定されていません。管理者に連絡してください。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      table,
      column_name,
      column_label: column_label || column_name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
