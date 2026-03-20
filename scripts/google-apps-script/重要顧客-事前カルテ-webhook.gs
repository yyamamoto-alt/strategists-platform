/**
 * 重要顧客（事前カルテ）（Googleフォーム）送信時にCRM Webhook + Slack通知を行うApps Script
 *
 * === セットアップ手順 ===
 * 1. 「重要顧客（事前カルテ）」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」→「トリガーを追加」→ 関数: onFormSubmit, イベント: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 */

const CRM_WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "8051873c74dafb5e47ab664b2c6506a41ded6aa05d5bf5f9d4fb1d0dd3b05e3c";
const SLACK_TOKEN = PropertiesService.getScriptProperties().getProperty("SLACK_TOKEN");
const SLACK_CHANNEL = "C0991BCEJAX";
const FORM_NAME = "重要顧客（事前カルテ）";
const BOT_USERNAME = "重要顧客勝ち取ろう";

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
    const message = "*名前：* " + (data["お名前"] || "") + "\n*ご経歴：* " + (data["経歴詳細（学歴＋職歴）"] || "") + "\n*意向:* " + (data["転職意向"] || "") + "\n*入社希望日:* " + (data["転職先への入社希望日"] || "") + "\n*長期メンタリングの関心：* " + (data["有料プログラムへの関心"] || "") + "\n*エージェント割引：* " + (data["エージェント併用について"] || "") + "\n*知った経緯：* " + (data["弊塾を最初に知った場所"] || "") + "\n*申し込みの決めて：* " + (data["弊塾への面談申し込みの決め手 (複数選択可)"] || "") + "";
    sendSlack(SLACK_CHANNEL, message, BOT_USERNAME);

    // Extra target: C0991BCEJAX
    sendSlack("C0991BCEJAX", "*⚠️営業から1週間経過しました⚠️*
*名前：* " + (data["お名前"] || "") + "
*ご経歴：* " + (data["経歴詳細（学歴＋職歴）"] || "") + "
*意向:* " + (data["転職意向"] || "") + "
*入社希望日:* " + (data["転職先への入社希望日"] || "") + "
*知った経緯：* " + (data["弊塾を最初に知った場所"] || "") + "", "重要顧客勝ち取ろう");
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
