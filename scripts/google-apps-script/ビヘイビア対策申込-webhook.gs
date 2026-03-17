/**
 * ビヘイビア対策申込（Googleフォーム）送信時にCRM Webhook + Slack通知を行うApps Script
 *
 * === セットアップ手順 ===
 * 1. 「ビヘイビア対策申込」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」→「トリガーを追加」→ 関数: onFormSubmit, イベント: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 */

const CRM_WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "f6154b56c835074ddda4ad20ce2d2ecc5d4387ec8d4911522fdd9eff7689608c";
const SLACK_TOKEN = PropertiesService.getScriptProperties().getProperty("SLACK_TOKEN");
const SLACK_CHANNEL = "C093LD0Q9AL";
const FORM_NAME = "ビヘイビア対策申込";
const BOT_USERNAME = "LMS";

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
    const message = "<@U03TF7YESK1>\nビヘイビア担当をお客様にアサインして案内をしてください。\n\n*お名前：* " + (data["お名前"] || "") + "\n*経歴：* " + (data["経歴"] || "") + "\n*主な職務経験①：* " + (data["主な職務経験①"] || "") + "\n*主な職務経験①での学び：* " + (data["主な職務経験①での学び"] || "") + "\n*主な職務経験②：* " + (data["主な職務経験②"] || "") + "\n*主な職務経験②での学び：* " + (data["主な職務経験②での学び"] || "") + "\n*主な職務経験③：* " + (data["主な職務経験③"] || "") + "\n*主な職務経験③での学び：* " + (data["主な職務経験③での学び"] || "") + "\n*強み・専門領域：* " + (data["強み・専門領域"] || "") + "\n*弱み：* " + (data["弱み"] || "") + "\n*キャリア選択：* " + (data["キャリア選択"] || "") + "\n*意思決定プロセス：* " + (data["意思決定プロセス"] || "") + "\n*コンサルティングファームを志望している理由：* " + (data["コンサルティングファームを志望している理由"] || "") + "\n*コンサルタントとしてやりたいこと：* " + (data["コンサルタントとしてやりたいこと"] || "") + "";
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
