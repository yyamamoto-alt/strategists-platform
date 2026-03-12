/**
 * カルテ（Googleフォーム）送信時にCRM Webhookへデータを送信するApps Script
 *
 * === セットアップ手順 ===
 * 1. カルテのGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」（時計アイコン）→「トリガーを追加」
 *    - 関数: onFormSubmit
 *    - イベントソース: フォームから
 *    - イベントタイプ: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 *
 * === 環境設定 ===
 * WEBHOOK_URL: CRMのWebhookエンドポイント
 * WEBHOOK_SECRET: CRON_SECRETと同じ値（Vercel環境変数）
 */

const WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "f6154b56c835074ddda4ad20ce2d2ecc5d4387ec8d4911522fdd9eff7689608c";
const FORM_NAME = "カルテ"; // フォーム識別名

function onFormSubmit(e) {
  try {
    // フォーム回答からデータを取得
    const responses = e.response.getItemResponses();
    const data = {};

    // タイムスタンプを追加
    data["タイムスタンプ"] = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    // 各質問の回答をマッピング
    for (const itemResponse of responses) {
      const title = itemResponse.getItem().getTitle();
      const answer = itemResponse.getResponse();
      if (answer) {
        data[title] = String(answer);
      }
    }

    // Webhookに送信
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

    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status !== 200) {
      console.error(`Webhook failed (${status}): ${body}`);
    } else {
      console.log(`Webhook success: ${body}`);
    }
  } catch (error) {
    console.error("onFormSubmit error:", error);
  }
}
