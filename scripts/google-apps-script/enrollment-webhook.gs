/**
 * 入塾フォーム（Googleフォーム）送信時に CRM + LMS の両方へデータを送信するApps Script
 *
 * === セットアップ手順 ===
 * 1. 「入塾フォーム」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」（時計アイコン）→「トリガーを追加」
 *    - 関数: onFormSubmit
 *    - イベントソース: フォームから
 *    - イベントタイプ: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 *
 * === 送信先 ===
 * 1. CRM: 顧客マッチング、ProgressSheet作成、Slack通知(#biz-dev)
 * 2. LMS: 入塾申請保存、営業確認Slack通知、自動招待フロー
 */

const CRM_WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const LMS_WEBHOOK_URL = "https://strategists-lms.vercel.app/api/webhook/enrollment";
const CRM_WEBHOOK_SECRET = "8051873c74dafb5e47ab664b2c6506a41ded6aa05d5bf5f9d4fb1d0dd3b05e3c";
const LMS_WEBHOOK_SECRET = "3d0d933d5f88c362f87684c0fc09ef17474805b8c746822115d512afe7eda4e1";
const FORM_NAME = "入塾フォーム";

/**
 * フォーム項目名 → LMSフィールドのマッピング
 * 入塾フォームの質問タイトルに合わせて調整すること
 */
const LMS_FIELD_MAP = {
  "お名前": "name",
  "名前": "name",
  "氏名": "name",
  "メールアドレス": "email",
  "メール": "email",
  "電話番号": "phone",
  "電話": "phone",
  "志望動機": "motivation",
  "転職理由": "motivation",
  "経歴": "experience",
  "職歴": "experience",
  "現在の勤務先": "experience",
  "プラン": "plan_name",
  "コース": "plan_name",
  "プラン名": "plan_name",
  "申込プラン": "plan_name",
  "エージェント利用": "agent_usage",
};

function onFormSubmit(e) {
  try {
    const responses = e.response.getItemResponses();
    const data = {};

    data["タイムスタンプ"] = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    for (const itemResponse of responses) {
      const title = itemResponse.getItem().getTitle();
      const answer = itemResponse.getResponse();
      if (answer) {
        data[title] = String(answer);
      }
    }

    // 1. CRM へ送信（既存フォーマット）
    sendToCRM(data);

    // 2. LMS へ送信（入塾自動化フロー）
    sendToLMS(data);

  } catch (error) {
    console.error(`[${FORM_NAME}] onFormSubmit error:`, error);
  }
}

/**
 * CRM Webhook へ送信
 * 顧客マッチング + ProgressSheet作成 + Slack通知(#biz-dev)
 */
function sendToCRM(data) {
  try {
    const payload = {
      secret: CRM_WEBHOOK_SECRET,
      formName: FORM_NAME,
      data: data,
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(CRM_WEBHOOK_URL, options);
    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status !== 200) {
      console.error(`[${FORM_NAME}][CRM] Webhook failed (${status}): ${body}`);
    } else {
      console.log(`[${FORM_NAME}][CRM] Webhook success: ${body}`);
    }
  } catch (error) {
    console.error(`[${FORM_NAME}][CRM] send error:`, error);
  }
}

/**
 * LMS Webhook へ送信
 * 入塾申請保存 + 営業確認Slack + 自動招待フロー
 */
function sendToLMS(data) {
  try {
    // フォーム項目名からLMSフィールドへ変換
    const lmsData = {
      webhook_secret: LMS_WEBHOOK_SECRET,
    };

    for (const [jpKey, value] of Object.entries(data)) {
      const engKey = LMS_FIELD_MAP[jpKey];
      if (engKey && !lmsData[engKey]) {
        lmsData[engKey] = value;
      }
    }

    // name と email が必須
    if (!lmsData.name || !lmsData.email) {
      console.error(`[${FORM_NAME}][LMS] name or email not found in form data. Keys: ${Object.keys(data).join(", ")}`);
      return;
    }

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(lmsData),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(LMS_WEBHOOK_URL, options);
    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status !== 200) {
      console.error(`[${FORM_NAME}][LMS] Webhook failed (${status}): ${body}`);
    } else {
      console.log(`[${FORM_NAME}][LMS] Webhook success: ${body}`);
    }
  } catch (error) {
    console.error(`[${FORM_NAME}][LMS] send error:`, error);
  }
}
