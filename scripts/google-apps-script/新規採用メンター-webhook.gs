/**
 * 新規採用メンター（Googleフォーム）送信時にCRM Webhook + Slack通知を行うApps Script
 *
 * === セットアップ手順 ===
 * 1. 「新規採用メンター」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」→「トリガーを追加」→ 関数: onFormSubmit, イベント: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 */

const CRM_WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "f6154b56c835074ddda4ad20ce2d2ecc5d4387ec8d4911522fdd9eff7689608c";
const SLACK_TOKEN = PropertiesService.getScriptProperties().getProperty("SLACK_TOKEN");
const SLACK_CHANNEL = "C094DA9A9B4";
const FORM_NAME = "新規採用メンター";
const BOT_USERNAME = "新規採用メンターの情報";

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

    // 1. CRM Webhook へ送信
    sendToCRM(data);

    // 2. Slack へ直接通知
    const message = "<@here!>\n" + (data["名前"] || "") + "\n" + (data["内定先"] || "") + "\n" + (data["学歴・学部"] || "") + "\n" + (data["所属選抜コミュニティ(なしならなしと回答)"] || "") + "\n" + (data["稼働希望時間／週"] || "") + "\n" + (data["その他連絡事項"] || "") + "\n" + (data["ビジネス経験(起業・インターンシップ等)"] || "") + "\n" + (data["リーダーシップ経験(学生団体・部活・サークル・起業・インターン等)"] || "") + "";
    sendSlack(SLACK_CHANNEL, message, BOT_USERNAME);

  } catch (error) {
    console.error("[" + FORM_NAME + "] onFormSubmit error:", error);
  }
}

function sendToCRM(data) {
  try {
    const payload = {
      secret: WEBHOOK_SECRET,
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
    if (status !== 200) {
      console.error("[" + FORM_NAME + "][CRM] Webhook failed (" + status + "): " + response.getContentText());
    }
  } catch (error) {
    console.error("[" + FORM_NAME + "][CRM] send error:", error);
  }
}

function sendSlack(channel, text, username) {
  try {
    const payload = {
      channel: channel,
      text: text,
      username: username || BOT_USERNAME,
    };
    const options = {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + SLACK_TOKEN },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };
    const response = UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", options);
    const result = JSON.parse(response.getContentText());
    if (!result.ok) {
      console.error("[" + FORM_NAME + "][Slack] Error: " + result.error);
    }
  } catch (error) {
    console.error("[" + FORM_NAME + "][Slack] send error:", error);
  }
}
