import { createClient } from "@supabase/supabase-js";
import { sendSlackMessage, sendInviteApprovalRequest, mapPlanToCourseIds } from "@/lib/slack";
import type { PaymentInfo, LearningInfo } from "@/lib/slack";
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
 *     plan_name: e.namedValues["プラン"] ? e.namedValues["プラン"][0] : null,
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
  const { name, email, phone, motivation, experience, plan_name, webhook_secret } = body;

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
      plan_name: plan_name || null,
      status: "pending",
      invite_status: "none",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `申請の保存に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }

  // 顧客の決済・契約・指導情報を取得
  const paymentInfo: PaymentInfo = { payments: [], totalPaid: 0 };
  const learningInfo: LearningInfo = {};

  try {
    // メールアドレスで顧客を検索
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, attribute")
      .eq("email", email)
      .single();

    if (customer) {
      // 契約情報
      const { data: contract } = await supabase
        .from("contracts")
        .select("plan_name, confirmed_amount, billing_status, subsidy_eligible, subsidy_amount, contract_amount, discount, progress_sheet_url")
        .eq("customer_id", customer.id)
        .single();

      if (contract) {
        paymentInfo.contractPlan = contract.plan_name;
        paymentInfo.confirmedAmount = contract.confirmed_amount;
        paymentInfo.billingStatus = contract.billing_status;
        paymentInfo.subsidyAmount = contract.subsidy_eligible ? contract.subsidy_amount : 0;
        learningInfo.progressSheetUrl = contract.progress_sheet_url;
      }

      // 指導情報
      const { data: learning } = await supabase
        .from("learning_records")
        .select("total_sessions, completed_sessions, contract_months, coaching_start_date, coaching_end_date, mentor_name")
        .eq("customer_id", customer.id)
        .single();

      if (learning) {
        learningInfo.totalSessions = learning.total_sessions;
        learningInfo.completedSessions = learning.completed_sessions;
        learningInfo.contractMonths = learning.contract_months;
        learningInfo.coachingStartDate = learning.coaching_start_date;
        learningInfo.coachingEndDate = learning.coaching_end_date;
        learningInfo.currentMentor = learning.mentor_name;
      }

      // ordersテーブルから決済履歴を取得
      const { data: orders } = await supabase
        .from("orders")
        .select("paid_at, ordered_at, amount, payment_method, status, product_name")
        .eq("customer_id", customer.id)
        .order("ordered_at", { ascending: false })
        .limit(10);

      if (orders && orders.length > 0) {
        paymentInfo.payments = orders.map((o: Record<string, unknown>) => ({
          date: ((o.paid_at || o.ordered_at) as string || "").split("T")[0],
          amount: (o.amount as number) || 0,
          method: o.payment_method === "bank_transfer" ? "銀行振込" : "カード/Apps",
        }));
        paymentInfo.totalPaid = orders
          .filter((o: Record<string, unknown>) => o.status === "paid")
          .reduce((sum: number, o: Record<string, unknown>) => sum + ((o.amount as number) || 0), 0);
      }
    }
  } catch (e) {
    console.error("Payment/learning info fetch error:", e);
  }

  // ================================================================
  // セールスチャンネルへプラン・エージェント確認通知（リアルタイム）
  // ================================================================
  try {
    // 顧客を検索してCRMリンクを作成
    const { data: matchedCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("email", email)
      .single();

    // 営業担当を取得
    let salesPerson: string | null = null;
    if (matchedCustomer) {
      const { data: pipeline } = await supabase
        .from("sales_pipeline")
        .select("sales_person")
        .eq("customer_id", matchedCustomer.id)
        .single();
      salesPerson = pipeline?.sales_person || null;
    }

    // 営業担当のSlack IDを取得
    let mention = "";
    if (salesPerson) {
      const { data: mappingRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "staff_slack_mapping")
        .single();
      if (mappingRow?.value) {
        const mapping = typeof mappingRow.value === "object"
          ? mappingRow.value as Record<string, string>
          : JSON.parse(String(mappingRow.value));
        const slackId = mapping[salesPerson] || mapping[salesPerson.split(/[\s　]/)[0]];
        if (slackId) mention = `<@${slackId}> `;
        else mention = `@${salesPerson} `;
      }
    }

    // 確認通知先チャンネルを取得
    const { data: channelSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "slack_channel_enrollment_confirmation")
      .single();
    const confirmChannel = channelSetting?.value
      ? String(channelSetting.value).replace(/"/g, "")
      : "C094YLMKR4K"; // デフォルト: #sales

    const agentUsage = body.agent_usage || body["エージェント利用"] || null;
    const customerId = matchedCustomer?.id || null;
    const crmUrl = customerId
      ? `https://strategists-crm.vercel.app/customers/${customerId}`
      : "";

    // ボタンのvalueにJSON埋め込み（customer_id + フォームデータ）
    const confirmPayload = JSON.stringify({
      customer_id: customerId,
      plan_name: plan_name || null,
      agent_usage: agentUsage,
    });

    const fallbackText = `${mention}📋 入塾フォーム受信 — ${name} のプラン・エージェント利用を確認してください`;

    // プラン選択肢
    const planOptions = [
      "既卒/長期", "既卒/通常", "既卒/短期", "既卒/特急", "既卒/超特急",
      "既卒/総コン特化", "既卒/McK特化", "既卒/補助金適用プラン", "既卒/自主学習",
      "新卒/スタンダード", "新卒/ライト", "新卒/ミニマム", "新卒/長期",
      "新卒/通常", "新卒/特急", "新卒/直前期", "新卒/選コミュ", "新卒/総コン特化", "新卒/McK特化",
      "総コン特化", "自主学習サポートパック", "その他",
    ].map((p) => ({ text: { type: "plain_text" as const, text: p }, value: p }));

    // エージェント利用選択肢
    const agentOptions = [
      { text: { type: "plain_text" as const, text: "フル利用" }, value: "フル利用" },
      { text: { type: "plain_text" as const, text: "一部利用" }, value: "一部利用" },
      { text: { type: "plain_text" as const, text: "スクールのみ（利用しない）" }, value: "スクールのみ" },
    ];

    // お客様入力値に一致する初期選択を探す
    const initialPlan = plan_name ? planOptions.find((o) => o.value === plan_name) : undefined;
    const initialAgent = agentUsage ? agentOptions.find((o) => agentUsage.includes(o.value.replace("（利用しない）", ""))) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: "📋【営業】入塾フォーム — プラン・エージェント確認", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*受講生:*\n${name}` },
          { type: "mrkdwn", text: `*メール:*\n${email}` },
          { type: "mrkdwn", text: `*申込プラン（お客様入力）:*\n${plan_name || "未入力"}` },
          { type: "mrkdwn", text: `*エージェント利用（お客様入力）:*\n${agentUsage || "未入力"}` },
        ],
      },
      ...(mention ? [{
        type: "context",
        elements: [{ type: "mrkdwn", text: `担当: ${mention}` }],
      }] : []),
      ...(crmUrl ? [{
        type: "context",
        elements: [{ type: "mrkdwn", text: `<${crmUrl}|CRMで詳細を見る>` }],
      }] : []),
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "⚠️ *正しいプランとエージェント利用を選択してから確定してください*\nお客様入力が正しければそのまま確定でOKです。" },
      },
      // プラン選択ドロップダウン
      {
        type: "section",
        block_id: `plan_select_${customerId || "unknown"}`,
        text: { type: "mrkdwn", text: "*プラン:*" },
        accessory: {
          type: "static_select",
          action_id: "select_enrollment_plan",
          placeholder: { type: "plain_text", text: "プランを選択..." },
          options: planOptions,
          ...(initialPlan ? { initial_option: initialPlan } : {}),
        },
      },
      // エージェント利用ドロップダウン
      {
        type: "section",
        block_id: `agent_select_${customerId || "unknown"}`,
        text: { type: "mrkdwn", text: "*エージェント利用:*" },
        accessory: {
          type: "static_select",
          action_id: "select_enrollment_agent",
          placeholder: { type: "plain_text", text: "利用区分を選択..." },
          options: agentOptions,
          ...(initialAgent ? { initial_option: initialAgent } : {}),
        },
      },
      // 確定ボタン
      {
        type: "actions",
        block_id: `enrollment_confirm_${customerId || "unknown"}`,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ 確定（CRMに反映）", emoji: true },
            style: "primary",
            action_id: "confirm_enrollment_data",
            value: confirmPayload,
          },
        ],
      },
    ];

    await sendSlackMessage(confirmChannel, fallbackText, blocks);
  } catch (e) {
    console.error("Enrollment confirmation notification error:", e);
  }

  // 自動招待が有効か確認
  let autoInviteTriggered = false;
  try {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["auto_invite_enabled", "auto_invite_slack_channel"]);

    const settingsMap: Record<string, string> = {};
    for (const s of (settings || []) as { key: string; value: string }[]) {
      settingsMap[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
    }

    const autoEnabled = settingsMap.auto_invite_enabled === "true";
    const slackChannel = settingsMap.auto_invite_slack_channel?.replace(/"/g, "");

    if (autoEnabled && slackChannel) {
      // Slack承認リクエスト送信（決済・指導情報付き）
      await sendInviteApprovalRequest(slackChannel, {
        id: data.id,
        name,
        email,
        planName: plan_name,
        paymentInfo,
        learningInfo,
      });

      // ステータスを更新
      await supabase
        .from("enrollment_applications")
        .update({ invite_status: "pending_approval" })
        .eq("id", data.id);

      autoInviteTriggered = true;
    }
  } catch (e) {
    console.error("Auto-invite flow error:", e);
  }

  return NextResponse.json({
    success: true,
    application_id: data.id,
    message: "入塾申請を受け付けました",
    auto_invite_triggered: autoInviteTriggered,
  });
}
