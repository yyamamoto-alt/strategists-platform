/**
 * メンター指導報告（Googleフォーム）送信時にCRM Webhookへデータを送信するApps Script
 *
 * === セットアップ手順 ===
 * 1. 「メンター指導報告」のGoogleフォームを開く
 * 2. 右上の「︙」→「スクリプトエディタ」
 * 3. このコードを貼り付けて保存
 * 4. 「トリガー」（時計アイコン）→「トリガーを追加」
 *    - 関数: onFormSubmit
 *    - イベントソース: フォームから
 *    - イベントタイプ: フォーム送信時
 * 5. 初回実行時にGoogleアカウントの認証を許可
 */

const WEBHOOK_URL = "https://strategists-crm.vercel.app/api/webhooks/google-forms";
const WEBHOOK_SECRET = "f6154b56c835074ddda4ad20ce2d2ecc5d4387ec8d4911522fdd9eff7689608c";
const FORM_NAME = "メンター指導報告";

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
