/**
 * ES添削（Googleフォーム）送信時にCRM Webhook + Slack通知を行うApps Script
 *
 * === セットアップ手順 ===
 * 1. 「ES添削」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」→「トリガーを追加」→ 関数: onFormSubmit, イベント: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 */

const CRM_WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "f6154b56c835074ddda4ad20ce2d2ecc5d4387ec8d4911522fdd9eff7689608c";
const SLACK_TOKEN = PropertiesService.getScriptProperties().getProperty("SLACK_TOKEN");
const SLACK_CHANNEL = "C0A25B7JY6A";
const FORM_NAME = "ES添削";
const BOT_USERNAME = "ES添削マン";

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
    const message = "<@U0A6ARW0U6B>\nESの添削をお願いします。\n名前：" + (data["お名前"] || "") + "\nLINE名：" + (data["LINE登録名"] || "") + "\n提出先：" + (data["提出するファーム・選抜コミュニティ"] || "") + "\n応募回数：" + (data["今回のESは何社/何団体目のものですか？"] || "") + "\n設問①：" + (data["ESの設問1"] || "") + "\n解答：" + (data["設問1への解答"] || "") + "\n設問②：" + (data["ESの設問2"] || "") + "\n解答：" + (data["ESの設問2への解答"] || "") + "\n設問③：" + (data["ESの設問3"] || "") + "\n解答：" + (data["ESの設問3への解答"] || "") + "";
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
