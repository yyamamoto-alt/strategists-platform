import { createClient } from "@supabase/supabase-js";
import { sendInviteEmail } from "@/lib/email";
import { mapPlanToCourseIds, sendMentorAssignmentDM } from "@/lib/slack";
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/webhook/slack-action
 * Slack Interactive Components (承認ボタン・コース選択) のコールバック
 *
 * Slack App設定:
 * - Interactivity & Shortcuts → Request URL: https://strategists-lms.vercel.app/api/webhook/slack-action
 */
export async function POST(request: Request) {
  // Slackはapplication/x-www-form-urlencodedでpayloadを送る
  // 署名検証のため生のボディを先に取得
  const rawBodyText = await request.text();

  // Slack署名検証（SLACK_SIGNING_SECRETが設定されている場合）
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = request.headers.get("X-Slack-Request-Timestamp");
    const slackSig = request.headers.get("X-Slack-Signature");

    if (!timestamp || !slackSig) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return NextResponse.json({ error: "Request too old" }, { status: 401 });
    }

    const sigBaseString = `v0:${timestamp}:${rawBodyText}`;
    const expectedSig = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBaseString, "utf8").digest("hex");

    if (expectedSig !== slackSig) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // rawBodyTextからpayloadを抽出
  const params = new URLSearchParams(rawBodyText);
  const payloadStr = params.get("payload");

  if (!payloadStr) {
    return NextResponse.json({ error: "No payload" }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  const action = payload.actions?.[0];
  if (!action) {
    return new Response("", { status: 200 });
  }

  const actionId = action.action_id;

  // ドロップダウン変更 → 何もしない（承認ボタン押下時に state から取得）
  if (actionId === "select_course" || actionId === "select_mentor") {
    return new Response("", { status: 200 });
  }

  const applicationId = action.value;
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

    return respondToSlack(payload, `❌ 却下されました (by ${userName})\n${application.name} (${application.email})`);
  }

  if (actionId === "approve_invite") {
    try {
      // Slackメッセージ内のドロップダウンの選択値を取得
      let selectedCourseId: string | null = null;
      let selectedMentor: string | null = null;
      const stateValues = payload.state?.values || {};
      for (const blockId of Object.keys(stateValues)) {
        if (blockId.startsWith("course_select_")) {
          const selectAction = stateValues[blockId]?.select_course;
          if (selectAction?.selected_option?.value) {
            selectedCourseId = selectAction.selected_option.value;
          }
        }
        if (blockId.startsWith("mentor_select_")) {
          const selectAction = stateValues[blockId]?.select_mentor;
          if (selectAction?.selected_option?.value) {
            selectedMentor = selectAction.selected_option.value;
          }
        }
      }

      // コースID決定: Slack選択 > フォームプラン名からの自動マッピング
      let courseIds: string[];
      if (selectedCourseId) {
        courseIds = [selectedCourseId];
      } else {
        courseIds = mapPlanToCourseIds(application.plan_name);
      }

      // 招待レコード作成
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // 顧客DBから紐づけ + 指導情報取得
      let customerId: string | null = null;
      let progressSheetUrl: string | null = null;
      let totalSessions: number | undefined;
      let contractMonths: number | undefined;
      let coachingStartDate: string | undefined;
      let coachingEndDate: string | undefined;
      let contractPlanName: string | undefined;

      const { data: customer } = await supabase
        .from("customers")
        .select("id, name")
        .eq("email", application.email)
        .single();

      if (customer) {
        customerId = customer.id;

        // 契約情報（プログレスシートURL含む）
        const { data: contract } = await supabase
          .from("contracts")
          .select("plan_name, progress_sheet_url")
          .eq("customer_id", customer.id)
          .single();
        if (contract) {
          progressSheetUrl = contract.progress_sheet_url;
          contractPlanName = contract.plan_name;
        }

        // 指導情報
        const { data: learning } = await supabase
          .from("learning_records")
          .select("total_sessions, contract_months, coaching_start_date, coaching_end_date")
          .eq("customer_id", customer.id)
          .single();
        if (learning) {
          totalSessions = learning.total_sessions;
          contractMonths = learning.contract_months;
          coachingStartDate = learning.coaching_start_date;
          coachingEndDate = learning.coaching_end_date;
        }
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
        return respondToSlack(payload, `❌ 招待作成エラー: ${invErr.message}`);
      }

      // 招待メール送信（メンター情報付き）
      const lmsUrl = process.env.NEXT_PUBLIC_APP_URL || "https://strategists-lms.vercel.app";
      const inviteUrl = `${lmsUrl}/invite/${token}`;

      let emailSent = false;
      try {
        await sendInviteEmail({
          to: application.email,
          displayName: application.name,
          role: "student",
          inviteUrl,
          appName: "LMS",
          mentorName: selectedMentor || undefined,
        });
        emailSent = true;
      } catch (e) {
        console.error("Email send error:", e);
      }

      // メンターにDM送信
      let mentorDmSent = false;
      if (selectedMentor) {
        try {
          await sendMentorAssignmentDM(selectedMentor, {
            name: application.name,
            email: application.email,
            planName: contractPlanName || application.plan_name,
            totalSessions,
            contractMonths,
            coachingStartDate,
            coachingEndDate,
            progressSheetUrl: progressSheetUrl || undefined,
          });
          mentorDmSent = true;
        } catch (e) {
          console.error("Mentor DM error:", e);
        }
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
      const mentorStatus = selectedMentor
        ? (mentorDmSent ? `メンター: ${selectedMentor} (DM送信済み)` : `メンター: ${selectedMentor} (DM送信失敗)`)
        : "メンター: 未選択";
      return respondToSlack(
        payload,
        `✅ 承認されました (by ${userName})\n*${application.name}* (${application.email})\n${mentorStatus}\n招待URL: ${inviteUrl}\n${emailSent ? "✅" : "⚠️"} ${emailStatus}`
      );
    } catch (e) {
      console.error("Approve error:", e);
      return respondToSlack(payload, `❌ エラーが発生しました: ${e}`);
    }
  }

  return new Response("", { status: 200 });
}

function respondToSlack(payload: { response_url?: string }, text: string) {
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
