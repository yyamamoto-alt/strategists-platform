import { createClient } from "@supabase/supabase-js";
import { sendInviteEmail } from "@/lib/email";
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/webhook/slack-action
 * Slack Interactive Components (承認ボタン) のコールバック
 *
 * Slack App設定:
 * - Interactivity & Shortcuts → Request URL: https://strategists-lms.vercel.app/api/webhook/slack-action
 */
export async function POST(request: Request) {
  // Slackはapplication/x-www-form-urlencodedでpayloadを送る
  const formData = await request.formData();
  const payloadStr = formData.get("payload") as string;

  if (!payloadStr) {
    return NextResponse.json({ error: "No payload" }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  // Slack署名検証（SLACK_SIGNING_SECRETが設定されている場合）
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = request.headers.get("X-Slack-Request-Timestamp");
    const slackSig = request.headers.get("X-Slack-Signature");

    if (!timestamp || !slackSig) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    // リプレイ攻撃防止（5分以内）
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return NextResponse.json({ error: "Request too old" }, { status: 401 });
    }

    const rawBody = `v0:${timestamp}:payload=${encodeURIComponent(payloadStr)}`;
    const expectedSig = "v0=" + crypto.createHmac("sha256", signingSecret).update(rawBody).digest("hex");

    if (expectedSig !== slackSig) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const action = payload.actions?.[0];
  if (!action) {
    return NextResponse.json({ ok: true });
  }

  const applicationId = action.value;
  const actionId = action.action_id;
  const userName = payload.user?.name || payload.user?.username || "不明";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return new Response("Server error", { status: 500 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 申請データ取得
  const { data: application } = await supabase
    .from("enrollment_applications")
    .select("*")
    .eq("id", applicationId)
    .single();

  if (!application) {
    return respondToSlack(payload, "申請データが見つかりませんでした。");
  }

  if (application.invite_status === "sent") {
    return respondToSlack(payload, "この申請は既に招待済みです。");
  }

  if (actionId === "reject_invite") {
    await supabase
      .from("enrollment_applications")
      .update({ invite_status: "rejected", approved_by: userName })
      .eq("id", applicationId);

    return respondToSlack(payload, `却下されました (by ${userName})\n${application.name} (${application.email})`);
  }

  if (actionId === "approve_invite") {
    try {
      // デフォルトコースIDを取得
      const { data: coursesSetting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "auto_invite_default_course_ids")
        .single();

      const courseIds = coursesSetting?.value ? (Array.isArray(coursesSetting.value) ? coursesSetting.value : JSON.parse(coursesSetting.value as string)) : [];

      // 招待レコード作成
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // 顧客DBから紐づけ
      let customerId: string | null = null;
      const { data: customer } = await supabase
        .from("customers")
        .select("id, name")
        .eq("email", application.email)
        .single();

      if (customer) {
        customerId = customer.id;
      }

      const { error: invErr } = await supabase.from("invitations").insert({
        email: application.email,
        display_name: application.name,
        role: "student",
        token,
        expires_at: expiresAt.toISOString(),
        customer_id: customerId,
        source: "lms",
        course_ids: courseIds,
      });

      if (invErr) {
        return respondToSlack(payload, `招待作成エラー: ${invErr.message}`);
      }

      // 招待メール送信
      const lmsUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://strategists-lms.vercel.app");
      const inviteUrl = `${lmsUrl}/invite/${token}`;

      let emailSent = false;
      try {
        await sendInviteEmail({
          to: application.email,
          displayName: application.name,
          role: "student",
          inviteUrl,
          appName: "LMS",
        });
        emailSent = true;
      } catch (e) {
        console.error("Email send error:", e);
      }

      // ステータス更新
      await supabase
        .from("enrollment_applications")
        .update({
          invite_status: "sent",
          invite_sent_at: new Date().toISOString(),
          approved_by: userName,
        })
        .eq("id", applicationId);

      const emailStatus = emailSent ? "メール送信済み" : "メール送信失敗（URLは生成済み）";
      return respondToSlack(
        payload,
        `承認されました (by ${userName})\n${application.name} (${application.email})\n招待URL: ${inviteUrl}\n${emailStatus}`
      );
    } catch (e) {
      console.error("Approve error:", e);
      return respondToSlack(payload, `エラーが発生しました: ${e}`);
    }
  }

  return new Response("", { status: 200 });
}

function respondToSlack(payload: { response_url?: string }, text: string) {
  // Slack response_urlに応答を返す（非同期でOK）
  if (payload.response_url) {
    fetch(payload.response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        replace_original: true,
        text,
      }),
    }).catch(console.error);
  }

  return new Response("", { status: 200 });
}
