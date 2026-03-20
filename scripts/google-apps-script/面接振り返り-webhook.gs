/**
 * 面接振り返り（Googleフォーム）送信時にCRM Webhook + Slack通知を行うApps Script
 *
 * === セットアップ手順 ===
 * 1. 「面接振り返り」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」→「トリガーを追加」→ 関数: onFormSubmit, イベント: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 */

const CRM_WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "8051873c74dafb5e47ab664b2c6506a41ded6aa05d5bf5f9d4fb1d0dd3b05e3c";
const SLACK_TOKEN = PropertiesService.getScriptProperties().getProperty("SLACK_TOKEN");
const SLACK_CHANNEL = "C07QJPSCVNX";
const FORM_NAME = "面接振り返り";
const BOT_USERNAME = "Strategistsくん";

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
    const message = "お客様が本番の選考を終えられました！こちらがその振り返り内容です。添削を行いLINEで送付してください。\n----------\n*名前：* " + (data["名前"] || "") + "\n*基本情報：* " + (data["基本情報"] || "") + "\n*思考時間：* " + (data["思考時間"] || "") + "\n*問題詳細：* " + (data["問題詳細"] || "") + "\n*アウトプット：* " + (data["アウトプット"] || "") + "\n*自己評価：* " + (data["自己評価"] || "") + "\n*面接官からのFB：* " + (data["面接官からのFB"] || "") + "\n*疑問：* " + (data["疑問"] || "") + "";
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
