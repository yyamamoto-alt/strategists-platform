/**
 * 卒業生アンケート（Googleフォーム）送信時にCRM Webhook + Slack通知を行うApps Script
 *
 * === セットアップ手順 ===
 * 1. 「卒業生アンケート」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」→「トリガーを追加」→ 関数: onFormSubmit, イベント: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 */

const CRM_WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "f6154b56c835074ddda4ad20ce2d2ecc5d4387ec8d4911522fdd9eff7689608c";
const SLACK_TOKEN = PropertiesService.getScriptProperties().getProperty("SLACK_TOKEN");
const SLACK_CHANNEL = "C07QJPSCVNX";
const FORM_NAME = "卒業生アンケート";
const BOT_USERNAME = "お客様の声";

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
    const message = "【卒業生アンケートに記入がありました】\n*名前：* " + (data["名前"] || "") + "\n*サービス全体への満足度：* " + (data["サービス全体への満足度"] || "") + "\n*動画講座や教科書などのコンテンツはいかがでしたか？：* " + (data["動画講座や教科書などのコンテンツはいかがでしたか？"] || "") + "\n*マンツーマン指導はいかがでしたか？：* " + (data["マンツーマン指導はいかがでしたか？"] || "") + "\n*担当のメンターはいかがでしたか？：* " + (data["担当のメンターはいかがでしたか？"] || "") + "\n*その他サービスはいかがでしたか？：* " + (data["その他サービスはいかがでしたか？"] || "") + "\n*特によかった点・サービスはなんでしたか？：* " + (data["特によかった点・サービスはなんでしたか？"] || "") + "\n*改善の余地がある点：* " + (data["改善の余地がある点"] || "") + "\n*要望：* " + (data["要望"] || "") + "\n*友人紹介のお願い：* " + (data["友人紹介のお願い"] || "") + "";
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
