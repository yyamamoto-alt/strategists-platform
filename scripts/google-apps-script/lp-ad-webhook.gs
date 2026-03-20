/**
 * LP申込(広告LP)（Googleフォーム）送信時にCRM Webhookへデータを送信するApps Script
 *
 * === セットアップ手順 ===
 * 1. 「LP申込(広告LP)」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」（時計アイコン）→「トリガーを追加」
 *    - 関数: onFormSubmit
 *    - イベントソース: フォームから
 *    - イベントタイプ: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 */

const WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "8051873c74dafb5e47ab664b2c6506a41ded6aa05d5bf5f9d4fb1d0dd3b05e3c";
const FORM_NAME = "LP申込(広告LP)";

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
      console.error(`[${FORM_NAME}] Webhook failed (${status}): ${body}`);
    } else {
      console.log(`[${FORM_NAME}] Webhook success: ${body}`);
    }
  } catch (error) {
    console.error(`[${FORM_NAME}] onFormSubmit error:`, error);
  }
}
