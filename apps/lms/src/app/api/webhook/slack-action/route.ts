import { createClient } from "@supabase/supabase-js";
import { sendInviteEmail } from "@/lib/email";
import { mapPlanToCourseIds, sendMentorAssignmentDM, fetchMentors } from "@/lib/slack";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/webhook/slack-action
 * Slack Interactive Components (承認ボタン・コース選択) のコールバック
 *
 * Slack App設定:
 * - Interactivity & Shortcuts → Request URL: https://strategists-lms.vercel.app/api/webhook/slack-action
 */
export async function POST(request: Request) {
  // レート制限: 30回/分
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { success } = rateLimit(`slack-action:${ip}`, 30, 60000);
  if (!success) {
    return NextResponse.json(
      { error: "リクエスト回数の上限に達しました" },
      { status: 429 }
    );
  }

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
  if (actionId === "select_course" || actionId === "select_mentor" || actionId === "select_enrollment_plan" || actionId === "select_enrollment_agent") {
    return new Response("", { status: 200 });
  }

  const userName = payload.user?.name || payload.user?.username || "不明";

  // ================================================================
  // 入塾フォーム: プラン・エージェント利用の確認/却下
  // ================================================================
  if (actionId === "confirm_enrollment_data") {
    try {
      const confirmData = JSON.parse(action.value);
      const { customer_id } = confirmData;

      if (!customer_id) {
        return respondToSlack(payload, "⚠️ 顧客IDが見つかりません。CRMで手動確認してください。");
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !svcKey) return respondToSlack(payload, "❌ サーバー設定エラー");

      const db = createClient(supabaseUrl, svcKey, { auth: { persistSession: false, autoRefreshToken: false } });

      // ドロップダウンから選択値を読み取る（state.values）
      let selectedPlan: string | null = confirmData.plan_name;
      let selectedAgent: string | null = confirmData.agent_usage;
      const stateValues = payload.state?.values || {};
      for (const blockId of Object.keys(stateValues)) {
        if (blockId.startsWith("plan_select_")) {
          const sel = stateValues[blockId]?.select_enrollment_plan;
          if (sel?.selected_option?.value) selectedPlan = sel.selected_option.value;
        }
        if (blockId.startsWith("agent_select_")) {
          const sel = stateValues[blockId]?.select_enrollment_agent;
          if (sel?.selected_option?.value) selectedAgent = sel.selected_option.value;
        }
      }
      // プラン名から補助金適用を自動判定
      const selectedSubsidy = !!(selectedPlan && selectedPlan.includes("補助金"));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contractUpd: Record<string, any> = {};
      if (selectedPlan) {
        contractUpd.plan_name = selectedPlan;
      }
      contractUpd.subsidy_eligible = selectedSubsidy;
      if (selectedAgent) {
        if (selectedAgent.includes("フル")) contractUpd.referral_category = "フル利用";
        else if (selectedAgent.includes("一部")) contractUpd.referral_category = "一部利用";
        else contractUpd.referral_category = selectedAgent;
      }

      if (Object.keys(contractUpd).length > 0) {
        contractUpd.updated_at = new Date().toISOString();
        const { count } = await db
          .from("contracts")
          .update(contractUpd)
          .eq("customer_id", customer_id);

        if (count === 0) {
          await db.from("contracts").insert({ customer_id, ...contractUpd });
        }
      }

      const crmUrl = `https://strategists-crm.vercel.app/customers/${customer_id}`;
      return respondToSlack(
        payload,
        `✅ *【営業】確認完了* (by ${userName})\nプラン: ${selectedPlan || "-"}\nエージェント利用: ${selectedAgent || "-"}${selectedSubsidy ? "\n補助金: ✅ 適用" : ""}\nCRMに反映しました。\n${crmUrl}`
      );
    } catch (e) {
      console.error("Enrollment confirm error:", e);
      return respondToSlack(payload, `❌ エラー: ${e}`);
    }
  }

  const applicationId = action.value;

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

      // 補助金フラグ取得（enrollment_applicationsまたはcontracts）
      let subsidyEligible = application.subsidy_eligible || false;

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
          .select("plan_name, progress_sheet_url, subsidy_eligible")
          .eq("customer_id", customer.id)
          .single();
        if (contract) {
          progressSheetUrl = contract.progress_sheet_url;
          contractPlanName = contract.plan_name;
          if (contract.subsidy_eligible) subsidyEligible = true;
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
        assigned_mentor_name: selectedMentor || null,
      });

      if (invErr) {
        return respondToSlack(payload, `❌ 招待作成エラー: ${invErr.message}`);
      }

      // learning_recordsのmentor_nameを更新
      if (selectedMentor && customerId) {
        await supabase
          .from("learning_records")
          .update({ mentor_name: selectedMentor })
          .eq("customer_id", customerId);
      }

      // student_mentorsに登録（招待受諾後にuser_idを紐づけるため、emailで仮保存）
      if (selectedMentor) {
        const mentorList = await fetchMentors();
        const mentorRec = mentorList.find(m => m.name === selectedMentor);
        if (mentorRec) {
          // 既存ユーザーを検索（既にアカウントがある場合）
          const { data: existingUser } = await supabase
            .from("users_view")
            .select("id")
            .eq("email", application.email)
            .maybeSingle();

          if (existingUser) {
            // 既存のprimaryメンターを解除
            await supabase
              .from("student_mentors")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("user_id", existingUser.id)
              .eq("role", "primary")
              .eq("is_active", true);

            await supabase.from("student_mentors").insert({
              user_id: existingUser.id,
              mentor_id: mentorRec.id,
              role: "primary",
            });
          }
        }
      }

      // メンター詳細情報をDBから取得
      let mentorLineUrl: string | undefined;
      let mentorBookingUrl: string | undefined;
      let mentorProfileText: string | undefined;
      if (selectedMentor) {
        const mentorList = await fetchMentors();
        const mentorRecord = mentorList.find(m => m.name === selectedMentor);
        if (mentorRecord) {
          mentorLineUrl = mentorRecord.line_url || undefined;
          mentorBookingUrl = mentorRecord.booking_url || undefined;
          mentorProfileText = mentorRecord.profile_text || undefined;
        }
      }

      // 招待メール送信（メンター情報付き）
      // ⚠️ invite_email_enabled が false の場合、メール送信をスキップ（ベータ期間中）
      const lmsUrl = process.env.NEXT_PUBLIC_APP_URL || "https://strategists-lms.vercel.app";
      const inviteUrl = `${lmsUrl}/invite/${token}`;

      let emailSent = false;
      const { data: emailSetting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "invite_email_enabled")
        .single();
      const emailEnabled = emailSetting?.value === "true" || emailSetting?.value === true;

      if (emailEnabled) {
        try {
          await sendInviteEmail({
            to: application.email,
            displayName: application.name,
            role: "student",
            inviteUrl,
            appName: "LMS",
            mentorName: selectedMentor || undefined,
            mentorLineUrl,
            mentorBookingUrl,
            mentorProfileText,
            subsidyEligible,
          });
          emailSent = true;
        } catch (e) {
          console.error("Email send error:", e);
        }
      } else {
        console.log(`[approve_invite] Email skipped (invite_email_enabled=false) for ${application.email}`);
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

      const emailStatus = emailEnabled
        ? (emailSent ? "メール送信済み" : "メール送信失敗（URLは生成済み）")
        : "メール送信スキップ（ベータ期間中）";
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
