import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Google Forms 入塾申請 Webhook
 *
 * Google Forms → Google Apps Script → このエンドポイントにPOST
 *
 * Apps Script 側の設定例:
 * ```javascript
 * function onFormSubmit(e) {
 *   const data = {
 *     name: e.namedValues["お名前"][0],
 *     email: e.namedValues["メールアドレス"][0],
 *     phone: e.namedValues["電話番号"] ? e.namedValues["電話番号"][0] : null,
 *     motivation: e.namedValues["志望動機"] ? e.namedValues["志望動機"][0] : null,
 *     experience: e.namedValues["経歴"] ? e.namedValues["経歴"][0] : null,
 *     webhook_secret: "YOUR_WEBHOOK_SECRET",
 *   };
 *   UrlFetchApp.fetch("https://strategists-lms.vercel.app/api/webhook/enrollment", {
 *     method: "post",
 *     contentType: "application/json",
 *     payload: JSON.stringify(data),
 *   });
 * }
 * ```
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, phone, motivation, experience, webhook_secret } = body;

  // Webhook認証
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (expectedSecret && webhook_secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!name || !email) {
    return NextResponse.json(
      { error: "name と email は必須です" },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "サーバー設定エラー" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // enrollment_applications テーブルに挿入
  const { data, error } = await supabase
    .from("enrollment_applications")
    .insert({
      name,
      email,
      phone: phone || null,
      motivation: motivation || null,
      experience: experience || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `申請の保存に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    application_id: data.id,
    message: "入塾申請を受け付けました",
  });
}
